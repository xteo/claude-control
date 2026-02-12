# Deployment Research: Vibe Companion

## Problem

We need a way to deploy The Vibe Companion (web UI + Claude Code CLI) to a public URL for testing and validating changes. The deployment must run inside a container where both the web server and Claude Code CLI operate together.

## Hard Requirements

| Requirement | Why |
|---|---|
| **WebSocket support** | Browser ↔ Server ↔ CLI all communicate over persistent WebSocket connections |
| **Subprocess spawning** | Server spawns `claude` CLI processes via `Bun.spawn()` |
| **Long-running processes** | Server + CLI subprocesses must stay alive (not scale-to-zero serverless) |
| **Bun runtime** | Server requires Bun ≥ 1.0 |
| **Claude Code CLI in PATH** | Requires Node.js 20+ and `npm install -g @anthropic-ai/claude-code` |
| **Single port** | Production serves everything on port 3456 (HTTP, WebSocket, static assets) |
| **Temp filesystem** | Sessions persist to `$TMPDIR/vibe-sessions/` |

## Why Google Cloud Run Is a Poor Fit

Cloud Run is designed for stateless request-response workloads. Running the Companion on it fights the architecture:

- **CPU throttling**: Without "always allocated CPU" + minimum instances, CPU drops to near-zero between requests, killing background CLI subprocesses
- **WebSocket timeout**: 60-minute maximum connection lifetime, requires reconnect logic
- **Cost**: Always-on 1 vCPU + 0.5 GiB costs ~$49/mo — you pay a serverless premium for VM-like behavior
- **Verdict**: Worst price-to-value ratio for this use case

## Platform Comparison

### Tier 1: Recommended

| Platform | Cost/mo | WebSocket | Subprocesses | Effort | Notes |
|---|---|---|---|---|---|
| **Fly.io** | ~$5 | Native | Full (Firecracker microVM) | Low | Best managed option. `fly deploy` from Dockerfile. Public URL + HTTPS included. |
| **Hetzner CX23 + Coolify** | ~$3.50 | Full | Full (bare Linux) | Medium | Best value. 2 vCPU / 4GB RAM. Web dashboard, Git deploys, auto SSL. ~30 min initial setup. |
| **Railway** | ~$5-10 | Yes | Yes | Low | Best developer experience. $5/mo hobby plan. Easy Git-based deploys. |

### Tier 2: Workable

| Platform | Cost/mo | Notes |
|---|---|---|
| **Render** | ~$7 | Works, but free tier sleeps on idle (kills WebSocket). Paid tier is pricier than Fly. |
| **Oracle Cloud Free Tier** | $0 | Genuinely free 4 ARM OCPU + 24GB RAM, BUT severe capacity shortages — you may wait days/weeks to provision. |
| **DigitalOcean Droplet** | ~$4-6 | Full VPS, no restrictions. No managed deploys — layer Coolify/Dokku on top. |

### Tier 3: Avoid for Testing

| Platform | Cost/mo | Why |
|---|---|---|
| **Google Cloud Run** | ~$49+ | Serverless tax on always-on workload |
| **AWS Fargate** | ~$20-25 | ALB alone costs $16/mo. Over-engineered for test deployment. |
| **Azure Container Instances** | ~$16-33 | Expensive, no built-in HTTPS termination |
| **DO App Platform** | ~$5-12 | Fewer features than Fly at same price, 4GB filesystem limit |

## Top Recommendation: Fly.io

**Why Fly.io wins for this project:**

1. **~$5/month** — shared-cpu-1x (256MB) runs 24/7. Can add auto-stop to pay less.
2. **Real microVM** — Firecracker-based, not sandboxed containers. Full subprocess spawning, no CPU throttling.
3. **Native WebSocket** — No timeouts, no proxy issues. TLS terminated at edge.
4. **Zero ops** — `fly deploy` builds and ships from Dockerfile. Public URL + HTTPS automatic.
5. **Volumes** — Persistent storage available if session data needs to survive deploys.
6. **Scale to zero** — Optional auto-stop/start to reduce costs when not in use.

### Deployment Workflow with Fly.io

```
1. Write Dockerfile (see below)
2. fly launch (one-time setup — picks region, app name, VM size)
3. fly secrets set ANTHROPIC_API_KEY=sk-ant-...
4. fly deploy (builds + deploys, takes ~2 min)
5. App available at https://your-app.fly.dev
```

For CI/CD: add `fly deploy` to a GitHub Action triggered on push to main.

## Proposed Dockerfile

```dockerfile
# Stage 1: Build frontend
FROM oven/bun:1 AS builder
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile
COPY web/ ./web/
RUN cd web && bun run build

# Stage 2: Production image
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git procps curl unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code@latest

# Copy application
WORKDIR /app
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --production --frozen-lockfile
COPY --from=builder /app/web/dist ./web/dist
COPY web/server ./web/server
COPY web/bin ./web/bin

# Session storage directory
RUN mkdir -p /tmp/vibe-sessions

ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

CMD ["bun", "web/server/index.ts"]
```

## Proposed fly.toml

```toml
app = "vibe-companion"
primary_region = "iad"  # US East (Washington DC)

[build]

[env]
  NODE_ENV = "production"
  PORT = "3456"

[http_service]
  internal_port = 3456
  force_https = true
  auto_stop_machines = "stop"     # Stop when idle to save money
  auto_start_machines = true      # Restart on incoming request
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

## Runner-Up: Hetzner + Coolify

If you want more power for less money and don't mind ~30 min of initial setup:

1. Create Hetzner CX23 server (€3.49/mo — 2 vCPU, 4GB RAM, 40GB NVMe)
2. Install Coolify (one-command installer: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
3. Point a domain to the server IP
4. In Coolify dashboard: add Git repo → it auto-detects Dockerfile → deploy
5. Coolify handles SSL via Let's Encrypt, webhooks for auto-deploy on push

**Advantages over Fly.io**: 4x more RAM, 2x more CPU, persistent filesystem, no cold starts.
**Disadvantages**: You manage the server (security updates, monitoring). Not as "push and forget."

## Workflow Summary

### Quick Start (Fly.io)

```bash
# One-time setup
fly auth login
fly launch --name vibe-companion --region iad --vm-size shared-cpu-1x --vm-memory 512
fly secrets set ANTHROPIC_API_KEY=sk-ant-...

# Every deploy
fly deploy

# Check logs
fly logs

# Open in browser
fly open
```

### Cost Breakdown (Fly.io)

| Item | Cost |
|---|---|
| shared-cpu-1x, 512MB, 24/7 | ~$4.64/mo |
| Dedicated IPv4 | $2/mo |
| Outbound data (estimate) | ~$0.50/mo |
| **Total** | **~$7/mo** |
| With auto-stop (idle hours) | **~$2-3/mo** |

## Security Notes

- **ANTHROPIC_API_KEY** must be set as a secret (not in Dockerfile or fly.toml)
- Consider adding basic auth or IP allowlisting if the URL is publicly accessible
- The Companion currently has no built-in authentication — anyone with the URL can create sessions and run Claude Code with your API key
- For testing: Fly.io supports `fly proxy` to tunnel traffic through your local machine without exposing publicly

## Next Steps

1. Create the Dockerfile and fly.toml in the repo
2. Test the Docker build locally: `docker build -t vibe-companion .` and `docker run -p 3456:3456 -e ANTHROPIC_API_KEY=... vibe-companion`
3. Deploy to Fly.io with `fly launch` + `fly deploy`
4. Validate WebSocket connections and CLI spawning work correctly
5. Set up CI/CD (optional): GitHub Action to auto-deploy on push
