import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateBasicAuth, basicAuthMiddleware } from "./auth.js";

describe("auth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
  });

  afterEach(() => {
    process.env.AUTH_USERNAME = originalEnv.AUTH_USERNAME;
    process.env.AUTH_PASSWORD = originalEnv.AUTH_PASSWORD;
  });

  describe("validateBasicAuth", () => {
    it("allows all requests when auth is not configured", () => {
      expect(validateBasicAuth(null)).toBe(true);
      expect(validateBasicAuth(undefined)).toBe(true);
      expect(validateBasicAuth("garbage")).toBe(true);
    });

    it("rejects requests with no credentials when auth is configured", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      expect(validateBasicAuth(null)).toBe(false);
      expect(validateBasicAuth(undefined)).toBe(false);
    });

    it("accepts valid Basic auth header", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const token = btoa("admin:secret");
      expect(validateBasicAuth(`Basic ${token}`)).toBe(true);
    });

    it("rejects invalid credentials", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const token = btoa("admin:wrong");
      expect(validateBasicAuth(`Basic ${token}`)).toBe(false);
    });

    it("accepts valid token query param as fallback", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const token = btoa("admin:secret");
      expect(validateBasicAuth(null, token)).toBe(true);
    });

    it("rejects invalid token query param", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const token = btoa("admin:wrong");
      expect(validateBasicAuth(null, token)).toBe(false);
    });

    it("prefers header over token param", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const goodToken = btoa("admin:secret");
      const badToken = btoa("admin:wrong");
      // Good header, bad param — should pass
      expect(validateBasicAuth(`Basic ${goodToken}`, badToken)).toBe(true);
    });

    it("handles passwords containing colons", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "pass:with:colons";
      const token = btoa("admin:pass:with:colons");
      expect(validateBasicAuth(`Basic ${token}`)).toBe(true);
    });

    it("handles malformed base64 gracefully", () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      expect(validateBasicAuth("Basic !!!notbase64!!!")).toBe(false);
    });

    it("requires both AUTH_USERNAME and AUTH_PASSWORD to enable auth", () => {
      process.env.AUTH_USERNAME = "admin";
      // AUTH_PASSWORD not set
      expect(validateBasicAuth(null)).toBe(true); // Auth disabled
    });
  });

  describe("basicAuthMiddleware", () => {
    it("passes through when auth is not configured", async () => {
      const middleware = basicAuthMiddleware();
      let nextCalled = false;
      const mockContext = {
        req: {
          url: "http://localhost:3456/api/sessions",
          header: () => undefined,
        },
      } as any;
      await middleware(mockContext, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it("returns 401 when auth is configured and no credentials provided", async () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const middleware = basicAuthMiddleware();
      let statusCode: number | undefined;
      const mockContext = {
        req: {
          url: "http://localhost:3456/api/sessions",
          header: () => undefined,
        },
        text: (body: string, status: number, headers: Record<string, string>) => {
          statusCode = status;
          return new Response(body, { status, headers });
        },
      } as any;
      await middleware(mockContext, async () => {});
      expect(statusCode).toBe(401);
    });

    it("skips auth for /health endpoint", async () => {
      process.env.AUTH_USERNAME = "admin";
      process.env.AUTH_PASSWORD = "secret";
      const middleware = basicAuthMiddleware();
      let nextCalled = false;
      const mockContext = {
        req: {
          url: "http://localhost:3456/health",
          header: () => undefined,
        },
      } as any;
      await middleware(mockContext, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });
});
