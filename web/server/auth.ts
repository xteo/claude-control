/**
 * Basic Auth for Fly.io deployment.
 *
 * Enabled only when both AUTH_USERNAME and AUTH_PASSWORD env vars are set.
 * When not set (local dev), all requests pass through without auth.
 *
 * - Hono routes: protected via basicAuthMiddleware()
 * - Browser WebSocket upgrade: protected via validateBasicAuth() in the
 *   Bun.serve() fetch handler (before server.upgrade())
 * - CLI WebSocket (/ws/cli/:id): NOT protected — internal, spawned by server
 */
import type { Context, Next } from "hono";

function getCredentials(): { username: string; password: string } | null {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  if (username && password) {
    return { username, password };
  }
  return null;
}

/**
 * Decode a Basic auth header value.
 * Accepts either "Basic <base64>" format or raw base64.
 */
function decodeBasic(value: string): { username: string; password: string } | null {
  try {
    const b64 = value.startsWith("Basic ") ? value.slice(6) : value;
    const decoded = atob(b64);
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    return {
      username: decoded.slice(0, colonIdx),
      password: decoded.slice(colonIdx + 1),
    };
  } catch {
    return null;
  }
}

/**
 * Validate Basic Auth credentials.
 *
 * @param authHeader  The Authorization header value (e.g. "Basic dXNlcjpwYXNz")
 * @param tokenParam  Fallback: a base64-encoded "user:pass" from ?token= query param
 * @returns true if auth is disabled (no env vars) or credentials match
 */
export function validateBasicAuth(
  authHeader: string | null | undefined,
  tokenParam?: string | null,
): boolean {
  const creds = getCredentials();
  if (!creds) return true; // Auth not configured — allow all

  // Try Authorization header first
  if (authHeader) {
    const decoded = decodeBasic(authHeader);
    if (decoded && decoded.username === creds.username && decoded.password === creds.password) {
      return true;
    }
  }

  // Fall back to ?token= query param (for WebSocket connections)
  if (tokenParam) {
    const decoded = decodeBasic(tokenParam);
    if (decoded && decoded.username === creds.username && decoded.password === creds.password) {
      return true;
    }
  }

  return false;
}

/**
 * Hono middleware for Basic Auth.
 * No-op when AUTH_USERNAME/AUTH_PASSWORD are not set.
 */
export function basicAuthMiddleware() {
  return async (c: Context, next: Next) => {
    const creds = getCredentials();
    if (!creds) return next(); // Auth not configured — pass through

    // Skip auth for health check
    if (new URL(c.req.url).pathname === "/health") return next();

    const authHeader = c.req.header("Authorization");
    if (validateBasicAuth(authHeader)) {
      return next();
    }

    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": 'Basic realm="Vibe Companion"',
    });
  };
}
