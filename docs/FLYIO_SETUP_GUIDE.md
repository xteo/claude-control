# Fly.io Setup Guide: Vibe Companion

Complete step-by-step guide for deploying the Vibe Companion to Fly.io with basic auth protection.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install flyctl CLI](#2-install-flyctl-cli)
3. [Account Setup](#3-account-setup)
4. [Project Configuration](#4-project-configuration)
5. [Dockerfile](#5-dockerfile)
6. [fly.toml](#6-flytoml)
7. [Basic Auth Implementation](#7-basic-auth-implementation)
8. [Health Check Endpoint](#8-health-check-endpoint)
9. [Secrets & Environment Variables](#9-secrets--environment-variables)
10. [First Deploy](#10-first-deploy)
11. [Persistent Storage (Volumes)](#11-persistent-storage-volumes)
12. [Monitoring & Debugging](#12-monitoring--debugging)
13. [CI/CD with GitHub Actions](#13-cicd-with-github-actions)
14. [Cost Optimization](#14-cost-optimization)
15. [Auth Architecture Deep Dive](#15-auth-architecture-deep-dive)

---

## 1. Prerequisites

- A Fly.io account (credit card required for new accounts)
- `ANTHROPIC_API_KEY` for Claude Code CLI
- Docker installed locally (optional, for local testing)
- Git repository with the Vibe Companion code

## 2. Install flyctl CLI

**macOS (Homebrew):**
```bash
brew install flyctl
```

**macOS / Linux (curl):**
```bash
curl -L https://fly.io/install.sh | sh
# Add to PATH (the script prints exact instructions)
```

**Verify installation:**
```bash
fly version
```

## 3. Account Setup

```bash
# Sign up (opens browser)
fly auth signup

# Or log in to existing account
fly auth login

# Verify
fly auth whoami
```

Credit card is required. No meaningful free tier for new accounts.

## 4. Project Configuration

From the repo root:

```bash
# Initialize Fly app (one-time)
fly launch \
  --name vibe-companion \
  --region iad \
  --no-deploy

# This creates fly.toml and registers the app
# We use --no-deploy to configure secrets first
```

**Region choices** (pick closest to you):
| Code | Location |
|------|----------|
| `iad` | Ashburn, Virginia (US East) |
| `sjc` | San Jose, California (US West) |
| `cdg` | Paris, France |
| `lhr` | London, UK |
| `nrt` | Tokyo, Japan |
| `syd` | Sydney, Australia |

Full list: `fly platform regions`

## 5. Dockerfile

Create `Dockerfile` in the repo root:

```dockerfile
# ─── Stage 1: Build frontend with Bun ──────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile
COPY web/ ./web/
RUN cd web && bun run build

# ─── Stage 2: Production image ─────────────────────────
# Use node:20 as base because Claude Code CLI requires Node.js
FROM node:20-slim

# System dependencies for Claude Code
RUN apt-get update && apt-get install -y --no-install-recommends \
    git procps curl unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun (needed for the Hono server)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code@latest

# Copy dependency files first (Docker layer caching)
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --production --frozen-lockfile

# Copy built frontend from stage 1
COPY --from=builder /app/web/dist ./web/dist

# Copy server source + CLI entry point
COPY web/server ./web/server
COPY web/bin ./web/bin

# Create session storage directory
RUN mkdir -p /tmp/vibe-sessions

ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

# Bind to 0.0.0.0 (required by Fly.io — not localhost)
CMD ["bun", "web/server/index.ts"]
```

Create `.dockerignore`:
```
node_modules
web/node_modules
web/dist
.git
*.md
.env*
landing/
scripts/
.husky/
```

**Why this structure:**
- **Stage 1** (Bun): Builds the Vite frontend → outputs `web/dist/`
- **Stage 2** (Node 20): Production runtime with both Node.js (for Claude Code CLI) and Bun (for Hono server)
- Claude Code CLI needs `node` and `npm` in PATH
- The server spawns `claude` as a subprocess, which is installed globally via npm

## 6. fly.toml

```toml
app = "vibe-companion"
primary_region = "iad"

kill_signal = "SIGTERM"
kill_timeout = 30
swap_size_mb = 256              # Prevents OOM when CLI spawns

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3456"
  # AUTH_USERNAME and AUTH_PASSWORD are set via `fly secrets` (not here)

[http_service]
  internal_port = 3456
  force_https = true
  auto_stop_machines = "stop"   # Stop VM when idle (saves money)
  auto_start_machines = true    # Restart on incoming request
  min_machines_running = 0      # Allow full stop when idle

  [http_service.concurrency]
    type = "connections"
    soft_limit = 25
    hard_limit = 50

  [[http_service.checks]]
    grace_period = "15s"        # Wait for server + CLI to boot
    interval = "30s"
    timeout = "5s"
    method = "GET"
    path = "/health"            # Health endpoint (see section 8)

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"              # Enough for server + 1-2 CLI sessions
```

**Key settings explained:**
- `auto_stop_machines = "stop"` — VM stops when no connections for ~5 min. You pay nothing for compute while stopped.
- `auto_start_machines = true` — Fly proxy boots the VM when a new request arrives (~3-5 second cold start).
- `swap_size_mb = 256` — Claude Code CLI + Bun server can spike past 512MB; swap prevents OOM kills.
- `force_https = true` — All HTTP redirects to HTTPS. WebSocket clients use `wss://`.

## 7. Basic Auth Implementation

### Architecture: What Gets Protected

```
PROTECTED (requires login/password):
├── GET  /*              ← Static files (HTML, JS, CSS)
├── ALL  /api/*          ← REST API endpoints
└── WS   /ws/browser/:id ← Browser WebSocket connections

NOT PROTECTED (internal):
└── WS   /ws/cli/:id     ← CLI WebSocket (spawned by server itself)
```

### How Auth Will Work

The Vibe Companion server has a **dual-path architecture**:

1. **Hono routes** (`/api/*`, `/*` static files) — use Hono's built-in `basicAuth()` middleware
2. **WebSocket upgrade** (`/ws/browser/:id`) — happens OUTSIDE Hono, in `Bun.serve()`'s `fetch()` handler. Auth must be validated there manually before calling `server.upgrade()`.
3. **CLI WebSocket** (`/ws/cli/:id`) — internal, spawned by the server itself. No auth needed.

### Implementation Plan

**Files to modify:**

| File | Change |
|------|--------|
| `web/server/index.ts` | Add Hono `basicAuth()` middleware + manual auth check before browser WS upgrade |
| `web/src/api.ts` | Add `Authorization: Basic ...` header to all fetch() calls |
| `web/src/ws.ts` | Pass credentials in WebSocket URL query params (browsers can't set WS headers) |
| `web/src/store.ts` or new `web/src/auth.ts` | Store credentials in memory after login prompt |
| New: `web/src/components/LoginPage.tsx` | Login form UI |

**Credential flow:**

```
┌─────────────┐   1. User opens URL
│   Browser    │──────────────────────────► Fly.io HTTPS
│             │
│  LoginPage   │   2. User enters username/password
│  ┌─────────┐ │
│  │ user: _ │ │   3. Credentials stored in Zustand store (memory)
│  │ pass: _ │ │
│  └─────────┘ │   4. All REST calls include Authorization header
│             │       Authorization: Basic base64(user:pass)
│  api.ts      │
│  ws.ts       │   5. WebSocket connects with ?token=base64(user:pass)
└─────────────┘       /ws/browser/:id?token=dXNlcjpwYXNz
                              │
                              ▼
┌─────────────────────────────────────────┐
│           Bun.serve() fetch()           │
│                                         │
│  /ws/browser/:id?token=...              │
│    → decode token                       │
│    → validate username:password         │
│    → if valid: server.upgrade()         │
│    → if invalid: 401 Unauthorized       │
│                                         │
│  /ws/cli/:id                            │
│    → no auth check                      │
│    → server.upgrade() directly          │
│                                         │
│  /* (everything else) → Hono app        │
│    → basicAuth() middleware             │
│    → if valid: serve route              │
│    → if invalid: 401 + WWW-Authenticate │
└─────────────────────────────────────────┘
```

**Credentials storage:**
- Set via environment variables: `AUTH_USERNAME` and `AUTH_PASSWORD`
- Configured as Fly.io secrets (encrypted, injected at boot)
- No database needed — single username/password for the whole instance

### WebSocket Auth Note

Browsers **cannot set custom headers** on WebSocket connections. The standard workaround is:
1. **Query parameter**: `/ws/browser/:id?token=base64(user:pass)` — simple, works everywhere. Token is in server logs but that's fine for basic auth.
2. **First-message auth**: Connect, send credentials as first message, server validates and disconnects if invalid. More complex.
3. **Cookie-based**: Set a session cookie on login, browser sends it automatically on WS upgrade. Requires cookie handling.

**Recommendation**: Query parameter approach. It's the simplest, compatible with the existing architecture, and adequate for a testing deployment.

## 8. Health Check Endpoint

Add a `/health` endpoint to the server. This is needed for Fly.io to know when the container is ready.

The health endpoint should:
- Return `200 OK` with a JSON body
- NOT require authentication (Fly's proxy calls it internally)
- Be lightweight (no DB queries, no subprocess checks)

```typescript
// In routes.ts or index.ts
app.get("/health", (c) => c.json({ status: "ok" }));
```

**Important**: The health route must be registered BEFORE the `basicAuth()` middleware, or excluded from auth.

## 9. Secrets & Environment Variables

```bash
# Required: Anthropic API key for Claude Code CLI
fly secrets set ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx

# Required: Basic auth credentials
fly secrets set AUTH_USERNAME=your-username
fly secrets set AUTH_PASSWORD=your-secure-password

# Optional: Set Claude model preferences
fly secrets set CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Verify (shows names only, never values)
fly secrets list

# Bulk import from .env file
fly secrets import < .env.production
```

**Non-sensitive vars** go in `fly.toml` under `[env]`:
```toml
[env]
  NODE_ENV = "production"
  PORT = "3456"
  LOG_LEVEL = "info"
```

Secrets are injected as environment variables when the VM boots. Setting a secret triggers a restart of all running machines.

## 10. First Deploy

```bash
# Step 1: Make sure fly.toml and Dockerfile exist
ls fly.toml Dockerfile

# Step 2: Set secrets (if not already done)
fly secrets set ANTHROPIC_API_KEY=sk-ant-... AUTH_USERNAME=admin AUTH_PASSWORD=...

# Step 3: Deploy
fly deploy

# This will:
#   1. Upload your code to Fly's remote builder
#   2. Build the Docker image (multi-stage)
#   3. Push to Fly's internal registry
#   4. Start 2 machines (default for redundancy)
#   5. Wait for health checks to pass
#   6. Route traffic to new machines

# Step 4: Scale to 1 machine (saves money for testing)
fly scale count 1

# Step 5: Verify
fly status
fly logs

# Step 6: Open in browser
fly open
# → Opens https://vibe-companion.fly.dev
```

**If the deploy fails:**
```bash
# Check build logs
fly logs

# SSH into the machine to debug
fly ssh console

# Check machine status (exit codes, events)
fly machine list
fly machine status <machine_id>

# Common fixes:
fly scale memory 1024    # If OOM killed
# Edit Dockerfile if build fails
```

## 11. Persistent Storage (Volumes)

Session data is stored in `$TMPDIR/vibe-sessions/`. Without a volume, this data is lost on every deploy and restart.

```bash
# Create a 1GB volume in your region
fly volumes create vibe_sessions --region iad --size 1
```

Add to `fly.toml`:
```toml
[[mounts]]
  source = "vibe_sessions"
  destination = "/data/vibe-sessions"
  initial_size = "1gb"
```

Set the env var so the app uses the mounted path:
```toml
[env]
  TMPDIR = "/data/vibe-sessions"
```

**Volume constraints:**
- 1 volume per machine (1:1 mapping)
- Region-locked — cannot be moved
- Billed at $0.15/GB/month whether running or not
- Survives deploys and restarts
- First mount replaces any files from the Docker image at that path

## 12. Monitoring & Debugging

```bash
# ─── Live Logs ───────────────────────────
fly logs                          # Stream all logs
fly logs --region iad             # Filter by region

# ─── App Status ──────────────────────────
fly status                        # Overview + machine states
fly machine list                  # List all machines with IDs

# ─── SSH Into Running Container ──────────
fly ssh console                   # Interactive shell
fly ssh console -C "ls /app"      # Run single command
fly ssh console -C "claude --version"  # Verify CLI is installed
fly ssh console -C "ps aux"       # Check running processes

# ─── Local Tunnel (Private Access) ──────
fly proxy 3456:3456               # Forward localhost:3456 → machine:3456
# Then open http://localhost:3456 — bypasses public URL

# ─── Health Checks ───────────────────────
fly checks list                   # See health check status

# ─── Machine Management ─────────────────
fly machine stop <id>             # Stop a specific machine
fly machine start <id>            # Start a specific machine

# ─── Dashboard ───────────────────────────
# https://fly.io/dashboard → web UI for logs, metrics, billing
```

## 13. CI/CD with GitHub Actions

### Generate a deploy token:
```bash
fly tokens deploy    # Scoped to this app only (recommended)
```

### Add to GitHub Secrets:
Repository → Settings → Secrets → Actions → `FLY_API_TOKEN`

### Workflow file: `.github/workflows/fly-deploy.yml`

```yaml
name: Deploy to Fly.io
on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    concurrency: fly-deploy        # Prevent concurrent deploys
    steps:
      - uses: actions/checkout@v4

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Every push to `main` triggers a deploy. Takes ~2-4 minutes.

## 14. Cost Optimization

### Minimal Setup (Testing/Validation)

| Resource | Cost |
|---|---|
| shared-cpu-1x, 512MB (auto-stop) | ~$0.50-3/mo |
| 1 GB volume | $0.15/mo |
| Shared IPv4 | Free |
| Outbound bandwidth | ~$0.02/GB |
| **Total with auto-stop** | **~$1-4/mo** |
| **Total always-on** | **~$5-7/mo** |

### Key cost levers:

1. **Enable auto-stop** (`auto_stop_machines = "stop"`) — VM stops when no active connections. You pay nothing for idle compute.
2. **Scale to 1 machine** (`fly scale count 1`) — Fly creates 2 by default.
3. **Use shared IPv4** (default, free) — dedicated IPv4 adds $2/mo.
4. **256MB RAM** if sessions are light — saves ~$1.30/mo vs 512MB.
5. **No volume** if you don't need session persistence across deploys.

### Auto-stop behavior:
- VM stops after ~5 minutes with no active HTTP/WebSocket connections
- On next request, Fly proxy boots the VM (~3-5 seconds cold start)
- Active WebSocket connections keep the machine running
- Health checks do NOT prevent auto-stop

## 15. Auth Architecture Deep Dive

### Current Server Architecture (No Auth)

```
Bun.serve({
  fetch(req, server) {
    ┌─────────────────────────────────────┐
    │ URL pattern matching                │
    │                                     │
    │ /ws/cli/:id    → server.upgrade()   │  ← OUTSIDE Hono
    │ /ws/browser/:id → server.upgrade()  │  ← OUTSIDE Hono
    │ everything else → app.fetch(req)    │  ← INTO Hono
    └─────────────────────────────────────┘
  },
  websocket: { open, message, close }
})

Hono app:
  app.use("/api/*", cors())
  app.route("/api", routes)
  app.use("/*", serveStatic({ root: "dist" }))   // production only
```

### Target Architecture (With Auth)

```
Bun.serve({
  fetch(req, server) {
    ┌────────────────────────────────────────────────┐
    │ URL pattern matching                           │
    │                                                │
    │ /ws/cli/:id                                    │
    │   → NO auth check (internal)                   │
    │   → server.upgrade()                           │
    │                                                │
    │ /ws/browser/:id?token=base64(user:pass)        │
    │   → extract token from query string            │
    │   → validate against AUTH_USERNAME/PASSWORD     │
    │   → if invalid: return 401                     │
    │   → if valid: server.upgrade()                 │
    │                                                │
    │ everything else → app.fetch(req)               │
    └────────────────────────────────────────────────┘
  }
})

Hono app:
  app.get("/health", healthHandler)         // BEFORE auth
  app.use("/api/*", cors())
  app.use("/api/*", basicAuth({             // Hono built-in middleware
    username: process.env.AUTH_USERNAME,
    password: process.env.AUTH_PASSWORD,
  }))
  app.route("/api", routes)
  app.use("/*", basicAuth({...}))           // Protect static files too
  app.use("/*", serveStatic({ root: "dist" }))
```

### Frontend Changes

**Login flow:**
1. Browser loads `index.html` (protected by basic auth → browser shows native auth dialog, or we show a custom login page)
2. User enters credentials → stored in Zustand store
3. All `fetch()` calls in `api.ts` include `Authorization: Basic base64(user:pass)` header
4. WebSocket connections append `?token=base64(user:pass)` to the URL
5. On 401 response → redirect to login / show auth dialog

**Two approaches for the login UI:**

| Approach | Pros | Cons |
|---|---|---|
| **Browser native basic auth** | Zero frontend changes. Browser prompts automatically on 401 + `WWW-Authenticate: Basic`. Credentials cached per session. | Ugly dialog. Can't customize. Can't "log out" easily. |
| **Custom login page** | Nice UI. Full control over UX. Can add "remember me", logout button. | Need to build LoginPage component. Need to handle credential storage. |

**Recommendation for testing**: Start with browser-native basic auth (zero frontend work). The browser caches credentials for the session. When you navigate to the URL, the browser pops up a username/password dialog. This works for REST calls AND static file access. For WebSocket, we still need the `?token=` query param approach since browsers don't send basic auth on WS upgrade requests.

---

## Quick Reference: Complete Deploy Checklist

```bash
# 1. Install CLI
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Initialize app
fly launch --name vibe-companion --region iad --no-deploy

# 4. Set secrets
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-api03-xxx \
  AUTH_USERNAME=admin \
  AUTH_PASSWORD=your-secure-password-here

# 5. Deploy
fly deploy

# 6. Scale to 1 machine
fly scale count 1

# 7. Open
fly open
# → https://vibe-companion.fly.dev
# → Browser prompts for username/password

# 8. Monitor
fly logs
fly status

# 9. SSH debug
fly ssh console

# 10. Redeploy after changes
fly deploy
```
