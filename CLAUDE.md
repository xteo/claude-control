# CLAUDE.md

This file provides guidance to Claude Code & Codex when working with code in this repository.

## What This Is

Claude Mission Control — a web UI for Claude Code & Codex.
It reverse-engineers the undocumented `--sdk-url` WebSocket protocol in the Claude Code CLI to provide a browser-based interface for running multiple Claude Code sessions with streaming, tool call visibility, and permission control.

Published as `the-vibe-companion` on npm. Users run it via `bunx the-vibe-companion`.

## Fork & Rebase Strategy

This is a fork. The upstream repo updates frequently. Our changes live mostly in the **frontend** (`web/src/`). To keep rebases painless:

- **Keep changes isolated.** Prefer adding new files/components over heavily modifying existing upstream files. When you must edit an upstream file, keep the diff minimal and localized.
- **Avoid reformatting or reorganizing upstream code.** Whitespace-only changes, import reordering, or renaming in files we don't own create unnecessary merge conflicts.
- **Don't modify `web/server/` unless strictly necessary.** The backend is upstream-owned and changes there are the hardest to rebase.
- **New features should be additive.** Add new components, new hooks, new utility files rather than weaving logic deep into existing upstream components. If you need to hook into an upstream component, prefer a thin integration point (a single prop, a wrapper component, a callback) over scattering changes throughout the file.
- **Keep commits small and focused.** One concern per commit makes interactive rebases and conflict resolution much easier.

## Development Commands

```bash
# Dev server (Hono backend on :3457 + Vite HMR on :5174)
cd web && bun install && bun run dev

# Or from repo root
make dev

# Type checking
cd web && bun run typecheck

# Production build + serve (backend on :3456)
cd web && bun run build && bun run start

# Run a single test file
cd web && bunx vitest run server/ws-bridge.test.ts

# Run tests matching a pattern
cd web && bunx vitest run -t "pattern"

# Landing page (thecompanion.sh) — idempotent: starts if down, no-op if up
# IMPORTANT: Always use this script to run the landing page. Never cd into landing/ and run bun/vite manually.
./scripts/landing-start.sh          # start
./scripts/landing-start.sh --stop   # stop
```

## Testing

```bash
# Run all tests
cd web && bun run test

# Watch mode
cd web && bun run test:watch
```

- All new backend (`web/server/`) and frontend (`web/src/`) code **must** include tests when possible.
- Tests use Vitest. Server tests use `node` environment, frontend tests use `jsdom` (auto-matched by path in `web/vitest.config.ts`).
- Tests live alongside source files (e.g. `routes.test.ts` next to `routes.ts`).
- A husky pre-commit hook runs `typecheck` and `test` before each commit.
- **Never remove or delete existing tests.** If a test is failing, fix the code or the test. If you believe a test should be removed, you must first explain to the user why and get explicit approval before removing it.
- When creating test, make sure to document what the test is validating, and any important context or edge cases in comments within the test code.

## Port Conventions

- **Dev backend**: 3457 (Hono)
- **Dev frontend**: 5174 (Vite HMR, proxies `/api` and `/ws` to 3457)
- **Production**: 3456 (serves both API and built frontend)

Dev and prod use different ports so both can run simultaneously.

## Component Playground

All UI components used in the message/chat flow **must** be represented in the Playground page (`web/src/components/Playground.tsx`, accessible at `#/playground`). When adding or modifying a message-related component (e.g. `MessageBubble`, `ToolBlock`, `PermissionBanner`, `Composer`, streaming indicators, tool groups, subagent groups), update the Playground to include a mock of the new or changed state.

## Architecture

### Data Flow

```
Browser (React) ←→ WebSocket ←→ Hono Server (Bun) ←→ WebSocket (NDJSON) ←→ Claude Code CLI
     :5174              /ws/browser/:id        :3457        /ws/cli/:id         (--sdk-url)
```

1. Browser sends a "create session" REST call to the server
2. Server spawns `claude --sdk-url ws://localhost:PORT/ws/cli/SESSION_ID` as a subprocess
3. CLI connects back to the server over WebSocket using NDJSON protocol
4. Server bridges messages between CLI WebSocket and browser WebSocket
5. Tool calls arrive as `control_request` (subtype `can_use_tool`) — browser renders approval UI, server relays `control_response` back

### Backend (`web/server/`)

- `index.ts` — Server bootstrap. `Bun.serve` with dual WebSocket upgrade (CLI vs browser). Wires together all modules and handles reconnection watchdog.
- `ws-bridge.ts` — Core message router. Maintains per-session state (CLI socket, browser sockets, message history, pending permissions). Parses NDJSON from CLI, translates to typed JSON for browsers.
- `cli-launcher.ts` — Spawns/kills/relaunches Claude Code CLI processes. Handles `--resume` for session recovery. Persists session state across server restarts.
- `codex-adapter.ts` — Translates between Codex app-server JSON-RPC protocol and the Companion's message types, so the browser is backend-agnostic.
- `session-store.ts` — JSON file persistence to `$TMPDIR/vibe-sessions/`. Debounced writes.
- `session-types.ts` — All TypeScript types for CLI messages (NDJSON), browser messages, session state, permissions. This is the canonical type file for the protocol.
- `routes.ts` — REST API: session CRUD, filesystem browsing, environment management.
- `env-manager.ts` — CRUD for environment profiles stored in `~/.companion/envs/`.
- `worktree-tracker.ts` — Git worktree management (creates isolated branches per session).
- `git-utils.ts` — Git operations (repo info, branch listing, worktree creation).
- `auto-namer.ts` — Auto-generates session titles using the Claude API after first turn.
- `usage-limits.ts` — Fetches Claude usage/rate limit info via OAuth.
- `update-checker.ts` — Periodic npm registry check for new versions.
- `service.ts` — macOS launchd service install/uninstall for running as background daemon.

### Frontend (`web/src/`)

- `store.ts` — Zustand store. All state keyed by session ID (messages, streaming text, permissions, tasks, connection status, changed files).
- `ws.ts` — Browser WebSocket client. Connects per-session, handles all incoming message types, auto-reconnects. Extracts task items from `TaskCreate`/`TaskUpdate`/`TodoWrite` tool calls.
- `types.ts` — Re-exports server types + client-only types (`ChatMessage`, `TaskItem`, `SdkSessionInfo`).
- `api.ts` — REST client for session management.
- `App.tsx` — Root layout with sidebar, chat view, task panel. Hash routing (`#/playground`).
- `utils/backends.ts` — Model/mode options that adapt to different backend types (Claude vs Codex).

### Other Directories

- `web/bin/cli.ts` — CLI entry point (`bunx the-companion`). Sets `__COMPANION_PACKAGE_ROOT` and imports the server.
- `landing/` — Marketing site (thecompanion.sh). Separate Vite app, managed via `./scripts/landing-start.sh`.

### WebSocket Protocol

The CLI uses NDJSON (newline-delimited JSON). Key message types from CLI: `system` (init/status), `assistant`, `result`, `stream_event`, `control_request`, `tool_progress`, `tool_use_summary`, `keep_alive`. Messages to CLI: `user`, `control_response`, `control_request` (for interrupt/set_model/set_permission_mode).

Full protocol documentation is in `WEBSOCKET_PROTOCOL_REVERSED.md`.

### Session Lifecycle

Sessions persist to disk (`$TMPDIR/vibe-sessions/`) and survive server restarts. On restart, live CLI processes are detected by PID and given a grace period to reconnect their WebSocket. If they don't, they're killed and relaunched with `--resume` using the CLI's internal session ID.

## Tech Stack

Bun runtime, Hono server, React 19, Zustand, Tailwind v4, Vite, Vitest.

## Browser Exploration

Always use `agent-browser` CLI command to explore the browser. Never use playwright or other browser automation libraries.

## Pull Requests

When submitting a pull request:
- Use commitizen to format the commit message and the PR title
- Add a screenshot of the changes in the PR description if it's a visual change
- Explain simply what the PR does and why it's needed
- Tell me if the code was reviewed by a human or simply generated directly by an AI.

### How To Open A PR With GitHub CLI

Use this flow from the repository root:

```bash
# 1) Create a branch
git checkout -b fix/short-description (commitzen)

# 2) Commit using commitzen format
git add <files>
git commit -m "fix(scope): short summary" (commitzen)

# 3) Push and set upstream
git push -u origin fix/short-description

# 4) Create PR (title should follow commitzen style)
gh pr create --base main --head fix/short-description --title "fix(scope): short summary"
```

For multi-line PR descriptions, prefer a body file to avoid shell quoting issues:

```bash
cat > /tmp/pr_body.md <<'EOF'
## Summary
- what changed

## Why
- why this is needed

## Testing
- what was run

## Review provenance
- Implemented by AI agent / Human
- Human review: yes/no
EOF

gh pr edit --body-file /tmp/pr_body.md
```

## Codex & Claude Code
- All features must be compatible with both Codex and Claude Code. If a feature is only compatible with one, it must be gated behind a clear UI affordance (e.g. "This feature requires Claude Code") and the incompatible option should be hidden or disabled.
- When implementing a new feature, always consider how it will work with both models and test with both if possible. If a feature is only implemented for one model, document that clearly in the code and in the UI.
