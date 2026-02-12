# ─── Stage 1: Build frontend with Bun + Vite ───────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile
COPY web/ ./web/
RUN cd web && bun run build

# ─── Stage 2: Production image ──────────────────────────────────
# node:20 as base — Claude Code CLI requires Node.js + npm
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git procps curl unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun (server runtime)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code@latest

WORKDIR /app

# Copy dependency files first (layer caching)
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile

# Copy built frontend from stage 1
COPY --from=builder /app/web/dist ./web/dist

# Copy server source + CLI entry point
COPY web/server ./web/server
COPY web/bin ./web/bin

# Session storage
RUN mkdir -p /tmp/vibe-sessions

ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

CMD ["bun", "web/server/index.ts"]
