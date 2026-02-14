import { Hono } from "hono";
import {
  isAuthConfigured,
  verifyCredentials,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  changePassword,
} from "./auth-manager.js";
import { COOKIE_NAME, COOKIE_MAX_AGE } from "./auth-middleware.js";

interface LoginRateState {
  failures: number;
  windowStartedAt: number;
  nextAllowedAt: number;
  lockUntil: number;
}

const LOGIN_ATTEMPTS_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_LOGIN_FAILURES = 8;
const BASE_LOGIN_DELAY_MS = 500;
const MAX_LOGIN_DELAY_MS = 10_000;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, LoginRateState>();

/** Build a Set-Cookie header value for the session token */
function shouldUseSecureCookie(req: { url: string; header: (name: string) => string | undefined }): boolean {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

function sessionCookie(req: { url: string; header: (name: string) => string | undefined }, token: string): string {
  const secure = shouldUseSecureCookie(req);
  const secureAttr = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

/** Build a Set-Cookie header that clears the session cookie */
function clearCookie(req: { url: string; header: (name: string) => string | undefined }): string {
  const secure = shouldUseSecureCookie(req);
  const secureAttr = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly${secureAttr}; SameSite=Lax; Path=/; Max-Age=0`;
}

function getClientKey(req: { header: (name: string) => string | undefined }): string {
  const candidates = [
    req.header("x-forwarded-for"),
    req.header("x-real-ip"),
    req.header("cf-connecting-ip"),
    req.header("x-client-ip"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ip = candidate.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return "unknown";
}

function getLoginState(clientKey: string): LoginRateState {
  const now = Date.now();
  let state = loginAttempts.get(clientKey);

  if (!state || now - state.windowStartedAt > LOGIN_ATTEMPTS_WINDOW_MS) {
    state = {
      failures: 0,
      windowStartedAt: now,
      nextAllowedAt: now,
      lockUntil: 0,
    };
    loginAttempts.set(clientKey, state);
  }

  return state;
}

function cleanupExpiredLoginState(now: number): void {
  for (const [key, state] of loginAttempts.entries()) {
    if (state.lockUntil && state.lockUntil > now) continue;
    if (now - state.windowStartedAt > LOGIN_ATTEMPTS_WINDOW_MS && state.failures < MAX_LOGIN_FAILURES) {
      loginAttempts.delete(key);
    }
  }
}

function maybeAllowLogin(clientKey: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  cleanupExpiredLoginState(now);
  const state = getLoginState(clientKey);

  if (state.lockUntil > now) {
    return { allowed: false, retryAfterMs: state.lockUntil - now };
  }

  if (state.nextAllowedAt > now) {
    return { allowed: false, retryAfterMs: state.nextAllowedAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}

function recordLoginFailure(clientKey: string): number {
  const now = Date.now();
  const state = getLoginState(clientKey);

  state.failures += 1;
  state.windowStartedAt = now;
  state.nextAllowedAt = now + Math.min(MAX_LOGIN_DELAY_MS, BASE_LOGIN_DELAY_MS * 2 ** (state.failures - 1));

  if (state.failures >= MAX_LOGIN_FAILURES) {
    state.lockUntil = now + LOCKOUT_MS;
    return LOCKOUT_MS;
  }

  return state.nextAllowedAt - now;
}

function recordLoginSuccess(clientKey: string): void {
  loginAttempts.delete(clientKey);
}

/** Parse session token from Cookie header */
function getTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return trimmed.slice(COOKIE_NAME.length + 1);
    }
  }
  return null;
}

export function createAuthRoutes() {
  const auth = new Hono();

  // GET /status — check if auth is configured and if the current cookie is valid
  auth.get("/status", (c) => {
    const configured = isAuthConfigured();
    let authenticated = false;
    if (configured) {
      const token = getTokenFromCookie(c.req.header("cookie"));
      authenticated = !!token && validateSessionToken(token);
    }
    return c.json({ configured, authenticated });
  });

  // POST /login — verify credentials and issue session cookie
  auth.post("/login", async (c) => {
    if (!isAuthConfigured()) {
      return c.json({ error: "Auth not configured. Use /setup first." }, 400);
    }

    const clientKey = getClientKey(c.req);
    const throttle = maybeAllowLogin(clientKey);
    if (!throttle.allowed) {
      c.header("Retry-After", `${Math.max(1, Math.ceil(throttle.retryAfterMs / 1000))}`);
      c.header("Cache-Control", "no-store");
      return c.json(
        { error: "Too many login attempts. Please wait before trying again." },
        429,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      const retryAfterMs = recordLoginFailure(clientKey);
      c.header("Retry-After", `${Math.max(1, Math.ceil(retryAfterMs / 1000))}`);
      return c.json({ error: "Username and password are required" }, 401);
    }

    const valid = await verifyCredentials(username, password);
    if (!valid) {
      const retryAfterMs = recordLoginFailure(clientKey);
      c.header("Retry-After", `${Math.max(1, Math.ceil(retryAfterMs / 1000))}`);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    recordLoginSuccess(clientKey);
    const token = createSessionToken();

    return c.json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(c.req, token),
    });
  });

  // POST /logout — revoke token and clear cookie
  auth.post("/logout", (c) => {
    revokeSessionToken();
    return c.json({ ok: true }, 200, {
      "Set-Cookie": clearCookie(c.req),
    });
  });

  // POST /change-password — authenticated password change
  auth.post("/change-password", async (c) => {
    // Must be authenticated
    const token = getTokenFromCookie(c.req.header("cookie"));
    if (!token || !validateSessionToken(token)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      return c.json({ error: "Both currentPassword and newPassword are required" }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ error: "New password must be at least 8 characters" }, 400);
    }

    const changed = await changePassword(currentPassword, newPassword);
    if (!changed) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    return c.json({ ok: true }, 200, {
      "Set-Cookie": clearCookie(c.req),
    });
  });

  return auth;
}
