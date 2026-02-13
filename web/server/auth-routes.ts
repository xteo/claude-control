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

/** Build a Set-Cookie header value for the session token */
function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

/** Build a Set-Cookie header that clears the session cookie */
function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
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

    const body = await c.req.json().catch(() => ({}));
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return c.json({ error: "Username and password are required" }, 400);
    }

    const valid = await verifyCredentials(username, password);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = createSessionToken();

    return c.json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(token),
    });
  });

  // POST /logout — revoke token and clear cookie
  auth.post("/logout", (c) => {
    revokeSessionToken();
    return c.json({ ok: true }, 200, {
      "Set-Cookie": clearCookie(),
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
      "Set-Cookie": clearCookie(),
    });
  });

  return auth;
}
