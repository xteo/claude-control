#!/bin/bash
set -euo pipefail

# ─── Generate ~/.claude.json ─────────────────────────────────────
# Claude Code requires hasCompletedOnboarding=true or it forces an
# interactive TOS flow that hangs in headless/container environments.
# The API key's last 20 characters must be pre-approved.

CLAUDE_DIR="${HOME}/.claude"
CLAUDE_JSON="${CLAUDE_DIR}/settings.json"
CLAUDE_CONFIG="${HOME}/.claude.json"
mkdir -p "$CLAUDE_DIR"

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  LAST_20="${ANTHROPIC_API_KEY: -20}"
  cat > "$CLAUDE_CONFIG" <<EOF
{
  "hasCompletedOnboarding": true,
  "customApiKeyResponses": {
    "approved": ["$LAST_20"],
    "rejected": []
  }
}
EOF
  echo "[start.sh] Generated $CLAUDE_CONFIG (onboarding bypassed)"
else
  echo "[start.sh] WARNING: ANTHROPIC_API_KEY not set — Claude Code will not authenticate"
fi

# ─── Start the Vibe Companion server ─────────────────────────────
echo "[start.sh] Starting server on port ${PORT:-3456}..."
exec bun web/server/index.ts
