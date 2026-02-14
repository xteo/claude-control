<p align="center">
  <img src="screenshot.png" alt="Claude Mission Control" width="100%" />
</p>

<h1 align="center">Claude Mission Control</h1>
<p align="center"><strong>Web UI for Claude Code and Codex sessions.</strong></p>
<p align="center">Run multiple agents, inspect every tool call, and gate risky actions with explicit approvals.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/the-companion"><img src="https://img.shields.io/npm/v/the-companion.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/the-companion"><img src="https://img.shields.io/npm/dm/the-companion.svg" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
</p>

## Quick start
Requirements:
- Bun
- Claude Code and/or Codex CLI available on your machine

Run:
```bash
bunx the-companion
```
Open `http://localhost:3456`.

Alternative foreground command:
```bash
the-companion serve
```

## Why this is useful
- **Parallel sessions**: work on multiple tasks without juggling terminals.
- **Full visibility**: see streaming output, tool calls, and tool results in one timeline.
- **Permission control**: approve/deny sensitive operations from the UI.
- **Session recovery**: restore work after process/server restarts.
- **Dual-engine support**: designed for both Claude Code and Codex-backed flows.

Claude Code is powerful but stuck in a terminal. You can't easily run multiple sessions, there's no visual feedback on tool calls, and if the process dies your context is gone.

Claude Mission Control fixes that. It spawns Claude Code processes, streams their output to your browser in real-time, and lets you approve or deny tool calls from a proper UI.

## What you get

- **Multiple sessions.** Run several Claude Code instances side by side. Each gets its own process, model, and permission settings.
- **Streaming.** Responses render token by token. You see what the agent is writing as it writes it.
- **Tool call visibility.** Every Bash command, file read, edit, grep, visible in collapsible blocks with syntax highlighting.
- **Subagent nesting.** When an agent spawns sub-agents, their work renders hierarchically so you can follow the full chain.
- **Permission control.** Four modes, from auto-approve everything down to manual approval for each tool call.
- **Session persistence.** Sessions save to disk and auto-recover with `--resume` after server restarts or CLI crashes.
- **Environment profiles.** Store API keys and config per-project in `~/.companion/envs/` without touching your shell.

## Screenshots
| Chat + tool timeline | Permission flow |
|---|---|
| <img src="screenshot.png" alt="Main workspace" width="100%" /> | <img src="web/docs/screenshots/notification-section.png" alt="Permission and notifications" width="100%" /> |

## How it works

The Claude Code CLI has a hidden `--sdk-url` flag. When set, it connects to a WebSocket server instead of running in a terminal. The protocol is NDJSON (newline-delimited JSON).

```
┌──────────────┐    WebSocket (NDJSON)    ┌─────────────────┐    WebSocket (JSON)    ┌─────────────┐
│  Claude Code │ ◄───────────────────────► │   Bun + Hono    │ ◄───────────────────► │   Browser   │
│     CLI      │  /ws/cli/:session        │     Server      │  /ws/browser/:session │   (React)   │
└──────────────┘                          └─────────────────┘                       └─────────────┘
```

The bridge uses the CLI `--sdk-url` websocket path and NDJSON events.

## Development
```bash
make dev
```

Manual:
```bash
cd web
bun install
bun run dev
```

Checks:
```bash
cd web
bun run typecheck
bun run test
```

## Docs
- Protocol reverse engineering: [`WEBSOCKET_PROTOCOL_REVERSED.md`](WEBSOCKET_PROTOCOL_REVERSED.md)
- Contributor and architecture guide: [`CLAUDE.md`](CLAUDE.md)

## License
MIT
