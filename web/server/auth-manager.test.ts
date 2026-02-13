import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// Polyfill Bun.password for Vitest (runs in Node, not Bun)
// Uses a simple sha256 "hash" — NOT real bcrypt, but sufficient for unit tests.
beforeAll(() => {
  if (typeof globalThis.Bun === "undefined") {
    const fakeHash = (pw: string) => `fakebcrypt$${createHash("sha256").update(pw).digest("hex")}`;
    (globalThis as Record<string, unknown>).Bun = {
      password: {
        hash: vi.fn(async (pw: string) => fakeHash(pw)),
        verify: vi.fn(async (pw: string, hash: string) => fakeHash(pw) === hash),
      },
    };
  }
});

import {
  isAuthConfigured,
  setupCredentials,
  verifyCredentials,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  changePassword,
  _resetForTest,
} from "./auth-manager.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "auth-test-"));
  _resetForTest(join(testDir, "auth.json"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("auth-manager", () => {
  describe("isAuthConfigured", () => {
    it("returns false when no auth.json exists", () => {
      expect(isAuthConfigured()).toBe(false);
    });

    it("returns true after credentials are set up", async () => {
      await setupCredentials("admin", "password123");
      expect(isAuthConfigured()).toBe(true);
    });
  });

  describe("setupCredentials", () => {
    it("creates credentials and allows verification", async () => {
      await setupCredentials("admin", "password123");
      expect(await verifyCredentials("admin", "password123")).toBe(true);
    });

    it("throws if called twice", async () => {
      await setupCredentials("admin", "password123");
      await expect(setupCredentials("admin", "another")).rejects.toThrow(
        "Auth already configured",
      );
    });

    it("persists credentials across reloads", async () => {
      const path = join(testDir, "auth.json");
      await setupCredentials("admin", "password123");
      // Simulate reload by resetting in-memory state but keeping the same file
      _resetForTest(path);
      expect(isAuthConfigured()).toBe(true);
      expect(await verifyCredentials("admin", "password123")).toBe(true);
    });
  });

  describe("verifyCredentials", () => {
    it("returns false when auth not configured", async () => {
      expect(await verifyCredentials("admin", "password123")).toBe(false);
    });

    it("returns false for wrong username", async () => {
      await setupCredentials("admin", "password123");
      expect(await verifyCredentials("wrong", "password123")).toBe(false);
    });

    it("returns false for wrong password", async () => {
      await setupCredentials("admin", "password123");
      expect(await verifyCredentials("admin", "wrongpass")).toBe(false);
    });
  });

  describe("session tokens", () => {
    it("creates and validates a token", async () => {
      await setupCredentials("admin", "password123");
      const token = createSessionToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(validateSessionToken(token)).toBe(true);
    });

    it("rejects invalid tokens", async () => {
      await setupCredentials("admin", "password123");
      createSessionToken();
      expect(validateSessionToken("not-a-real-token")).toBe(false);
    });

    it("rejects tokens after revocation", async () => {
      await setupCredentials("admin", "password123");
      const token = createSessionToken();
      expect(validateSessionToken(token)).toBe(true);
      revokeSessionToken();
      expect(validateSessionToken(token)).toBe(false);
    });

    it("replaces old token when a new one is created", async () => {
      await setupCredentials("admin", "password123");
      const token1 = createSessionToken();
      const token2 = createSessionToken();
      // New token is valid, old one is not (single-session model)
      expect(validateSessionToken(token2)).toBe(true);
      expect(validateSessionToken(token1)).toBe(false);
    });

    it("returns false when no auth configured", () => {
      expect(validateSessionToken("anything")).toBe(false);
    });
  });

  describe("changePassword", () => {
    it("changes the password and revokes the session", async () => {
      await setupCredentials("admin", "oldpass12");
      const token = createSessionToken();

      const changed = await changePassword("oldpass12", "newpass12");
      expect(changed).toBe(true);

      // Old password no longer works
      expect(await verifyCredentials("admin", "oldpass12")).toBe(false);
      // New password works
      expect(await verifyCredentials("admin", "newpass12")).toBe(true);
      // Old token is revoked
      expect(validateSessionToken(token)).toBe(false);
    });

    it("returns false for incorrect current password", async () => {
      await setupCredentials("admin", "password123");
      const changed = await changePassword("wrongpass", "newpass12");
      expect(changed).toBe(false);
      // Original password still works
      expect(await verifyCredentials("admin", "password123")).toBe(true);
    });

    it("returns false when auth not configured", async () => {
      const changed = await changePassword("any", "other123");
      expect(changed).toBe(false);
    });
  });
});
