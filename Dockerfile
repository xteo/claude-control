# ─── Stage 1: Build frontend with Bun + Vite ───────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile
COPY web/ ./web/
RUN cd web && bun run build

# ─── Stage 2: Production image ──────────────────────────────────
# node:20 base — Claude Code CLI requires Node.js + npm in PATH
FROM node:20-slim

# System deps for Claude Code + server
# - git, procps, jq: core CLI requirements
# - curl, unzip: Bun installer
# - sudo: needed by Claude Code's firewall init (if used)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git procps curl unzip jq sudo \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun (Hono server runtime)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code@latest

# Verify claude binary is in PATH
RUN claude --version

WORKDIR /app

# Copy dependency files first (Docker layer caching)
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile

# Copy built frontend from stage 1
COPY --from=builder /app/web/dist ./web/dist

# Copy server source + CLI entry point
COPY web/server ./web/server
COPY web/bin ./web/bin

# Copy startup script
COPY deploy/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Session storage
RUN mkdir -p /tmp/vibe-sessions

# Disable Claude Code telemetry, auto-updater, error reporting in container
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

# start.sh generates ~/.claude.json (onboarding bypass) then starts the server
CMD ["/app/start.sh"]
