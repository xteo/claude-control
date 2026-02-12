# Implementation Progress Tracker

This file tracks the implementation status of planned features across their respective branches.

---

## Overview

| # | Feature | Branch | Status | Assignee |
|---|---------|--------|--------|----------|
| 1 | [Dark Mode Theme Overhaul](#1-dark-mode-theme-overhaul) | `claude/feat-dark-theme-*` | Planned | TBD |
| 2 | [Sandbox & YOLO Mode](#2-sandbox--yolo-mode) | `claude/feat-sandbox-yolo-*` | Planned | TBD |
| 3 | [Dual-Launch (Claude + Codex)](#3-dual-launch-claude--codex) | `claude/feat-dual-launch-*` | Planned | TBD |
| 4 | [SDK Integration Hardening](#4-sdk-integration-hardening) | `claude/feat-sdk-hardening-*` | Planned | TBD |

**Legend:** Planned | In Progress | Review | Done | Blocked

---

## 1. Dark Mode Theme Overhaul

**Branch:** `claude/feat-dark-theme-*`
**Status:** Planned
**Spec:** [FEATURES.md — Feature 4](./FEATURES.md#feature-4-dark-mode-theme-overhaul-codex-black--gray)

### Tasks

- [ ] Update light mode CSS variables in `web/src/index.css` (cool gray palette)
- [ ] Update dark mode CSS variables in `web/src/index.css` (Codex black palette)
- [ ] Replace hardcoded colors in `Sidebar.tsx` (amber-500, red-500)
- [ ] Replace hardcoded colors in `HomePage.tsx` (amber-500, green-500, blue-500)
- [ ] Replace hardcoded colors in `SessionItem.tsx` (blue-500, #5BA8A0, green-500, red-400)
- [ ] Visual QA: test all views in light mode
- [ ] Visual QA: test all views in dark mode
- [ ] Update Playground component with theme samples
- [ ] (Optional) Add theme selector (Codex Black / Claude Beige)

### Notes

Primary change is in a single CSS file. All 27+ components auto-inherit via Tailwind utilities.

---

## 2. Sandbox & YOLO Mode

**Branch:** `claude/feat-sandbox-yolo-*`
**Status:** Planned
**Spec:** [FEATURES.md — Feature 2](./FEATURES.md#feature-2-sandbox--yolo-mode)

### Tasks

#### Sandbox Mode (Claude)
- [ ] Investigate Claude CLI sandbox flags (test `--sandbox`, `--dangerously-skip-permissions`)
- [ ] Add `claudeSandbox` field to `SdkSessionInfo` and `LaunchOptions` in `session-types.ts`
- [ ] Pass sandbox flag in `cli-launcher.ts` when launching Claude CLI
- [ ] Add sandbox toggle to `HomePage.tsx` for Claude backend
- [ ] Accept `claudeSandbox` in `POST /sessions/create` in `routes.ts`
- [ ] Add tests for sandbox session creation

#### YOLO Mode (Auto-Accept)
- [ ] Add `autoApprove` field to `SdkSessionInfo` in `session-types.ts`
- [ ] Implement auto-response logic in `ws-bridge.ts` for permission requests
- [ ] Add audit logging for auto-approved actions
- [ ] Add YOLO toggle to `HomePage.tsx` with safety warnings
- [ ] Add YOLO indicator to `TopBar.tsx` and `Sidebar.tsx`
- [ ] (Optional) Add per-tool auto-approve rules
- [ ] Add tests for YOLO permission auto-response

### Notes

Codex sandbox already works (`workspace-write` / `danger-full-access`). This feature extends sandbox to Claude and adds universal auto-accept.

---

## 3. Dual-Launch (Claude + Codex)

**Branch:** `claude/feat-dual-launch-*`
**Status:** Planned
**Spec:** [FEATURES.md — Feature 3](./FEATURES.md#feature-3-dual-launch-claude--codex-with-worktrees)

### Tasks

#### Backend (session linking)
- [ ] Add `siblingGroup` and `siblingRole` to `SdkSessionInfo` in `session-types.ts`
- [ ] Create `POST /sessions/create-dual` endpoint in `routes.ts`
- [ ] Implement dual worktree creation logic (2 separate worktrees per dual session)
- [ ] Add sibling broadcasting in `ws-bridge.ts`
- [ ] Add `createDualSession()` to `api.ts`
- [ ] Add tests for dual-launch endpoint

#### Frontend (compare UI)
- [ ] Add "Launch on Both" button to `HomePage.tsx`
- [ ] Implement sibling grouping in `Sidebar.tsx` / `SessionItem.tsx`
- [ ] Create `CompareView.tsx` component (side-by-side message feeds)
- [ ] Add compare route to `App.tsx`
- [ ] Track sibling relationships in `store.ts`
- [ ] Add compare view to Playground

#### Polish
- [ ] "Send to both" / "Send to one" message routing in compose
- [ ] Summary panel (tokens, tool calls, time, files changed)
- [ ] Visual QA of sibling sessions in sidebar

### Notes

Infrastructure is ~80% built (Codex integrated, worktrees ready, backend detection working). Main work is the linking model and comparison UI.

---

## 4. SDK Integration Hardening

**Branch:** `claude/feat-sdk-hardening-*`
**Status:** Planned
**Spec:** [FEATURES.md — Feature 1](./FEATURES.md#feature-1-backend-sdk-integration-review)

### Tasks

- [ ] Add protocol version detection on CLI WebSocket connect
- [ ] Validate `system` message shape on init, warn on unexpected format
- [ ] Add graceful degradation when protocol changes are detected
- [ ] Document current protocol shapes in TypeScript (stricter types)
- [ ] (Optional) Add `@anthropic-ai/sdk` as fallback for direct API access
- [ ] Add integration tests for CLI message parsing

### Notes

Low urgency but important for long-term stability. The `--sdk-url` protocol is undocumented and could change in any CLI update.

---

## Changelog

| Date | Feature | Update |
|------|---------|--------|
| 2026-02-12 | All | Initial planning and feature specs created |
