import type { MiddlewareHandler } from "hono";
import { isAuthConfigured, validateSessionToken } from "./auth-manager.js";

export const COOKIE_NAME = "companion_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/** Paths that are always accessible (no auth required) */
const PUBLIC_PATHS = ["/api/auth/status", "/api/auth/login", "/api/auth/setup"];

/**
 * Hono middleware that gates API routes behind cookie-based auth.
 * When auth is not configured, only the status endpoint is accessible —
 * the app is fully locked until credentials are set up via CLI.
 */
export function authMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Always allow public auth endpoints (status, login)
    if (PUBLIC_PATHS.includes(c.req.path)) return next();

    // If auth not configured, block all non-public endpoints
    if (!isAuthConfigured()) {
      return c.json({ error: "Auth not configured. Run 'the-companion auth setup' on the server." }, 403);
    }

    // Validate session cookie
    const cookieHeader = c.req.header("cookie") || "";
    const token = parseCookieToken(cookieHeader);
    if (!token || !validateSessionToken(token)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return next();
  };
}

/**
 * Validates the session cookie from a raw Request object.
 * Used for WebSocket upgrade validation in Bun.serve's fetch handler.
 * Returns false if auth is not configured (app locked until CLI setup).
 */
export function validateWsCookie(req: Request): boolean {
  if (!isAuthConfigured()) return false;
  const cookieHeader = req.headers.get("cookie") || "";
  const token = parseCookieToken(cookieHeader);
  if (!token) return false;
  return validateSessionToken(token);
}

/** Parse the session token from a Cookie header string */
function parseCookieToken(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return trimmed.slice(COOKIE_NAME.length + 1);
    }
  }
  return null;
}
