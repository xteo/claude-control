# Implementation Progress Tracker

This file tracks the implementation status of planned features across their respective branches.

---

## Overview

| # | Feature | Branch | Status | Assignee |
|---|---------|--------|--------|----------|
| 1 | [Dark Mode Theme Overhaul](#1-dark-mode-theme-overhaul) | `main` | **Done** | Claude |
| 2 | [Sandbox & YOLO Mode](#2-sandbox--yolo-mode) | `main` | **Done** | Claude |
| 3 | [Dual-Launch (Claude + Codex)](#3-dual-launch-claude--codex) | `claude/feat-dual-launch-*` | Planned | TBD |
| 4 | [SDK Integration Hardening](#4-sdk-integration-hardening) | `claude/feat-sdk-hardening-*` | Planned | TBD |
| 5 | [Session Collections](#5-session-collections) | `main` | **Done** | Claude |
| 6 | [Enhanced Diff Review](#6-enhanced-diff-review) | `main` | **Done** | Claude |
| 7 | [Rebrand to Claude Mission Control](#7-rebrand) | `main` | **Done** | Claude |

**Legend:** Planned | In Progress | Review | Done | Blocked

---

## 1. Dark Mode Theme Overhaul

**Branch:** `main`
**Status:** Done
**Spec:** [FEATURES.md — Feature 4](./FEATURES.md#feature-4-dark-mode-theme-overhaul-codex-black--gray)

### Tasks

- [x] Update dark mode CSS variables in `web/src/index.css` (cool near-black palette)
- [x] Replace hardcoded colors in `DiffFileTree.tsx` (green-400, red-400, yellow-400 -> theme tokens)
- [x] Fix DiffViewer light mode (use card bg instead of code-bg, proper file/hunk headers)
- [x] Visual QA: test all views in light mode
- [x] Visual QA: test all views in dark mode

### Key Color Changes (Dark Mode)

| Token | Before | After |
|-------|--------|-------|
| Background | `#2b2a27` | `#141414` |
| Card | `#1f1e1b` | `#1C1C1C` |
| Sidebar | `#252422` | `#181818` |
| Muted text | `#8a8780` | `#8C8C8C` |
| Success | `#48bb78` | `#4ADE80` |
| Error | `#fc8181` | `#F87171` |
| Warning | `#f6e05e` | `#FBBF24` |

---

## 2. Sandbox & YOLO Mode

**Branch:** `main`
**Status:** Done (shipped in prior PR)
**Spec:** [FEATURES.md — Feature 2](./FEATURES.md#feature-2-sandbox--yolo-mode)

Implemented in PRs #2 and #3. Claude Code sandbox mode via `--settings` flag, YOLO mode via `--dangerously-skip-permissions`. Both with UI toggles and confirmation dialogs.

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

## 5. Session Collections

**Branch:** `main`
**Status:** Done

Sidebar sessions can now be organized into named, collapsible collections with drag-and-drop reorder.

### New Files
- `web/src/collections/` — Zustand store, types, drag-reorder utils, sidebar grouping hook
- `web/src/components/CollectionGroup.tsx` + test — Collapsible collection group
- `web/src/components/CreateCollectionButton.tsx` — Inline create button in sidebar

### Modified Files
- `Sidebar.tsx` — Collection groups above ungrouped projects, drop zones
- `SessionItem.tsx` — Drag handle for collection assignment
- `store.ts` — Collapsed projects state
- `App.tsx` — Collection store wiring

---

## 6. Enhanced Diff Review

**Branch:** `main`
**Status:** Done

Full-featured diff review panel with file tree, scope selector, and unified diff rendering.

### New Files
- `web/src/components/EnhancedDiffPanel.tsx` — Three-pane diff layout
- `web/src/components/DiffFileTree.tsx` — Hierarchical file tree with status indicators
- `web/src/components/DiffContentArea.tsx` — Selected file diff content
- `web/src/components/DiffScopeSelector.tsx` — Uncommitted/staged/commit-range toggle
- `web/src/hooks/useDiffData.ts` — Diff fetching hook
- `web/src/lib/diff-stats.ts` — Unified diff parser

### Modified Files
- `routes.ts` — `GET /api/sessions/:id/diff` endpoint
- `api.ts` — `getSessionDiff()` client method
- `ws.ts` — Tracks changed files from tool results
- `store.ts` — `changedFiles` state per session

### Bug Fix
- `DiffViewer.tsx` — `parsePatchToHunks` now skips `\ No newline at end of file` markers

---

## 7. Rebrand

**Branch:** `main`
**Status:** Done

Renamed "The Vibe Companion" to "Claude Mission Control" across all user-facing surfaces.

### Changes
- **UI:** Sidebar header, HomePage hero, MessageFeed empty state
- **HTML/PWA:** `<title>`, manifest name/short_name, background color
- **Backend/CLI:** Service messages, Codex adapter client title
- **Docs:** CLAUDE.md, README.md, FEATURES.md, CODEX_MAPPING.md

> npm package name `the-vibe-companion` unchanged.

---

## Changelog

| Date | Feature | Update |
|------|---------|--------|
| 2026-02-13 | Collections | Session collections with drag-and-drop, collapsible groups |
| 2026-02-13 | Diff Review | Enhanced diff panel with file tree, scope selector, DiffViewer light mode fix |
| 2026-02-13 | Dark Mode | Cool near-black palette, improved contrast, theme-aware diff colors |
| 2026-02-13 | Rebrand | "The Vibe Companion" -> "Claude Mission Control" |
| 2026-02-13 | Tests | Fixed 7 failing tests, all 786 passing |
| 2026-02-12 | All | Initial planning and feature specs created |
