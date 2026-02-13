import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthConfig {
  username: string;
  passwordHash: string;
  sessionToken: string | null;
  tokenIssuedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── State ────────────────────────────────────────────────────────────────────

const DEFAULT_PATH = join(homedir(), ".companion", "auth.json");
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let filePath = DEFAULT_PATH;
let config: AuthConfig | null = null;
let loaded = false;

// ── Internal helpers ─────────────────────────────────────────────────────────

function load(): void {
  if (loaded) return;
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as AuthConfig;
      if (raw && typeof raw.username === "string" && typeof raw.passwordHash === "string") {
        config = raw;
      }
    }
  } catch {
    config = null;
  }
  loaded = true;
}

function persist(): void {
  if (!config) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isAuthConfigured(): boolean {
  load();
  return config !== null;
}

export async function setupCredentials(username: string, password: string): Promise<void> {
  load();
  if (config) throw new Error("Auth already configured");
  const passwordHash = await Bun.password.hash(password, "bcrypt");
  config = {
    username,
    passwordHash,
    sessionToken: null,
    tokenIssuedAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  persist();
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  load();
  if (!config) return false;
  if (config.username !== username) return false;
  return Bun.password.verify(password, config.passwordHash);
}

export function createSessionToken(): string {
  load();
  if (!config) throw new Error("Auth not configured");
  const token = randomBytes(32).toString("hex");
  config.sessionToken = token;
  config.tokenIssuedAt = Date.now();
  config.updatedAt = Date.now();
  persist();
  return token;
}

export function validateSessionToken(token: string): boolean {
  load();
  if (!config || !config.sessionToken) return false;

  // Check expiry
  if (Date.now() - config.tokenIssuedAt > TOKEN_MAX_AGE_MS) {
    return false;
  }

  // Constant-time comparison
  const a = Buffer.from(token, "utf-8");
  const b = Buffer.from(config.sessionToken, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function revokeSessionToken(): void {
  load();
  if (!config) return;
  config.sessionToken = null;
  config.tokenIssuedAt = 0;
  config.updatedAt = Date.now();
  persist();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
  load();
  if (!config) return false;
  const valid = await Bun.password.verify(currentPassword, config.passwordHash);
  if (!valid) return false;
  config.passwordHash = await Bun.password.hash(newPassword, "bcrypt");
  config.sessionToken = null;
  config.tokenIssuedAt = 0;
  config.updatedAt = Date.now();
  persist();
  return true;
}

export function _resetForTest(customPath?: string): void {
  loaded = false;
  filePath = customPath || DEFAULT_PATH;
  config = null;
}
