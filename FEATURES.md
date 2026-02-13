# Feature Specifications

This document details the four upcoming features for Claude Mission Control, based on a thorough review of the current codebase.

---

## Table of Contents

1. [Feature 1: Backend SDK Integration Review](#feature-1-backend-sdk-integration-review)
2. [Feature 2: Sandbox & YOLO Mode](#feature-2-sandbox--yolo-mode)
3. [Feature 3: Dual-Launch (Claude + Codex) with Worktrees](#feature-3-dual-launch-claude--codex-with-worktrees)
4. [Feature 4: Dark Mode Theme Overhaul (Codex Black & Gray)](#feature-4-dark-mode-theme-overhaul-codex-black--gray)

---

## Feature 1: Backend SDK Integration Review

### Current State

Claude Mission Control has **zero official Anthropic SDK dependency**. The entire Claude Code integration is reverse-engineered against the undocumented `--sdk-url` WebSocket flag on the CLI.

### How It Works

```
Browser (React)  <-->  WsBridge (Hono/Bun :3456)  <-->  Claude CLI (--sdk-url WebSocket)
     :5174                 NDJSON router                     Spawned subprocess
```

**CLI spawn command** (`web/server/cli-launcher.ts:248-283`):
```
claude --sdk-url ws://localhost:3456/ws/cli/{sessionId}
       --print
       --output-format stream-json
       --input-format stream-json
       --verbose
       --model {model}
       --permission-mode {mode}
       -p ""
```

**Codex uses a completely different path** (`cli-launcher.ts:334-415`):
- Spawned via `codex app-server` with stdio pipes (not WebSocket)
- Communication is JSON-RPC over stdin/stdout
- Wrapped by a `CodexAdapter` class that translates to the same internal message format

### Protocol Details

All message types are defined in `web/server/session-types.ts` and documented in `WEBSOCKET_PROTOCOL_REVERSED.md`:

| Direction | Message Types |
|-----------|--------------|
| CLI -> Server | `system`, `assistant`, `result`, `stream_event`, `control_request`, `tool_progress`, `tool_use_summary`, `keep_alive` |
| Server -> CLI | `user`, `control_response`, `control_request` (interrupt/set_model/set_permission_mode) |

### Key Session Fields (`session-types.ts:10-48`)

| Field | Type | Purpose |
|-------|------|---------|
| `sessionId` | `string` (UUID) | Unique session identifier |
| `pid` | `number` | OS process ID |
| `state` | `"starting" \| "connected" \| "running" \| "exited"` | Lifecycle state |
| `cliSessionId` | `string` | Claude CLI's internal ID (for `--resume`) |
| `backendType` | `"claude" \| "codex"` | Backend selection |
| `codexSandbox` | `"workspace-write" \| "danger-full-access"` | Codex sandbox level |

### Risks & Recommendations

- **Fragility**: If Anthropic changes the `--sdk-url` protocol, integration breaks. No schema validation beyond TypeScript types.
- **Recommendation**: Add a protocol version handshake on CLI connect. The CLI sends a `system` message on init — validate its shape and warn the user if it changes.
- **Recommendation**: Consider adding an official `@anthropic-ai/sdk` path as a fallback for direct API access (useful for features that don't need the CLI's tool execution).

---

## Feature 2: Sandbox & YOLO Mode

### Current State

| Capability | Claude Code | Codex |
|------------|-------------|-------|
| Sandbox mode | Not implemented | Implemented (`workspace-write` / `danger-full-access`) |
| Permission modes | 2 modes (`bypassPermissions` = "Agent", `plan` = "Plan") | 3 modes (`auto`, `accept-edits`, `suggest`) |
| YOLO / auto-accept | Not implemented | Possible via `bypassPermissions` + approval policy `"never"` |
| Frontend auto-response | Manual Allow/Deny only | Manual Allow/Deny only |

### Codex Sandbox (Already Implemented)

Codex sandbox is controlled by `codexSandbox` in `LaunchOptions` (`session-types.ts:61`):
- `"workspace-write"` — Default. Restricted filesystem access.
- `"danger-full-access"` — Unrestricted. Enabled when `codexInternetAccess: true` (`cli-launcher.ts:118`).

### What Needs to Be Built

#### 2a. Claude Sandbox Mode

Claude Code CLI may support sandbox flags that are not yet surfaced in the UI. Investigation needed:

**Files to modify:**
- `web/server/session-types.ts` — Add `claudeSandbox?: boolean` to `SdkSessionInfo` and `LaunchOptions`
- `web/server/cli-launcher.ts` — Pass `--sandbox` flag (or equivalent) when launching Claude CLI
- `web/src/components/HomePage.tsx` — Add sandbox toggle to Claude session creation form
- `web/server/routes.ts` — Accept and forward `claudeSandbox` in `POST /sessions/create`

#### 2b. YOLO Mode (Auto-Accept Permissions)

Currently, every `control_request` with `subtype: "can_use_tool"` is forwarded to the browser and requires a manual click in `PermissionBanner`. YOLO mode would auto-accept these.

**Implementation plan:**

1. **Add session-level YOLO flag**
   - `session-types.ts`: Add `autoApprove?: boolean` to `SdkSessionInfo`
   - `routes.ts`: Accept `autoApprove` in session creation

2. **Auto-respond in WsBridge** (`ws-bridge.ts:686-706`)
   ```
   if (session.autoApprove) {
     // Immediately send control_response with behavior: "allow"
     // Log the auto-approved action to messageHistory for audit trail
   } else {
     // Current behavior: broadcast to browsers
   }
   ```

3. **Frontend toggle**
   - `HomePage.tsx`: Add "YOLO Mode" toggle with warning text
   - `TopBar.tsx`: Show indicator when session is in YOLO mode
   - `Sidebar.tsx`: Badge or icon on YOLO sessions

4. **Safety guardrails**
   - Maintain an audit log of all auto-approved tool calls in the message history
   - Allow per-tool exclusions (e.g., auto-approve file reads but not file writes)
   - Show a running count of auto-approved actions in the UI

**Files to modify:** `session-types.ts`, `cli-launcher.ts`, `ws-bridge.ts`, `routes.ts`, `HomePage.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `PermissionBanner.tsx`

---

## Feature 3: Dual-Launch (Claude + Codex) with Worktrees

### Current State — What Already Exists

The infrastructure is ~80% built:

- **Codex backend fully integrated** — `CodexAdapter` in `cli-launcher.ts:334-415` handles JSON-RPC over stdio
- **Git worktree system is mature** — `ensureWorktree()` creates isolated worktrees with unique branch names (`branch-wt-XXXX`)
- **`WorktreeTracker`** persists worktree-to-session mappings in `~/.companion/worktrees.json`
- **Backend detection** — `GET /backends` (`routes.ts:235-255`) checks which CLIs are installed
- **Session creation** already accepts `backend: "claude" | "codex"` parameter

### What's Missing

#### 3a. Session Linking Model

No concept of "sibling sessions" exists. Each session is fully independent.

**Add to `session-types.ts`:**
```typescript
interface SdkSessionInfo {
  // ... existing fields
  siblingGroup?: string;    // UUID linking sibling sessions
  siblingRole?: string;     // e.g. "claude" or "codex" — which backend
}
```

#### 3b. Dual-Launch API Endpoint

**New endpoint in `routes.ts`:**
```
POST /sessions/create-dual
{
  cwd: string,
  branch?: string,
  task: string,              // Initial prompt sent to both
  claudeModel?: string,
  codexModel?: string,
  claudePermissionMode?: string,
  codexSandbox?: string,
  useWorktree: boolean       // Should default to true for isolation
}
```

**Behavior:**
1. Generate a `siblingGroup` UUID
2. Create worktree A for Claude, worktree B for Codex (using `ensureWorktree()` with `forceNew: true`)
3. Launch Claude session with worktree A
4. Launch Codex session with worktree B
5. Send the same `task` prompt to both
6. Return both `SdkSessionInfo` objects with matching `siblingGroup`

#### 3c. Sidebar Grouping

Currently sessions are grouped by project directory via `groupSessionsByProject()` (`Sidebar.tsx:220`).

**Changes needed:**
- Within each project group, detect sibling sessions by `siblingGroup`
- Render them as a connected pair with a visual indicator (e.g., "Claude vs Codex" with a divider)
- Add a "Compare" button that opens a side-by-side view

#### 3d. Compare View (New Component)

**New component: `web/src/components/CompareView.tsx`**

- Side-by-side layout showing two `MessageFeed` components
- Shared scroll synchronization (optional)
- Summary panel showing:
  - Token usage per session
  - Number of tool calls
  - Time to completion
  - Files modified (diff between worktrees)

#### 3e. Message Broadcasting

To send user follow-up messages to both sessions:

**Modify `ws-bridge.ts`:**
- Add `broadcastToSiblings(siblingGroup, message)` method
- When a user sends a message in a dual session, offer "Send to both" or "Send to this one"

### Files to Modify

| File | Changes |
|------|---------|
| `session-types.ts` | Add `siblingGroup`, `siblingRole` fields |
| `routes.ts` | Add `POST /sessions/create-dual` endpoint |
| `cli-launcher.ts` | Support dual-launch orchestration |
| `ws-bridge.ts` | Add sibling broadcasting, compare state tracking |
| `api.ts` | Add `createDualSession()` client function |
| `store.ts` | Track sibling relationships |
| `Sidebar.tsx` | Sibling grouping UI |
| `HomePage.tsx` | "Launch on Both" button |
| `CompareView.tsx` | **New file** — Side-by-side comparison UI |
| `App.tsx` | Route for compare view |

### Architecture Diagram

```
User clicks "Launch on Both"
         |
    POST /sessions/create-dual
         |
    +----+----+
    |         |
  Worktree A  Worktree B
  (branch-a)  (branch-b)
    |         |
  Claude CLI  Codex CLI
  (WebSocket) (stdio/JSON-RPC)
    |         |
  WsBridge session A  WsBridge session B
  (siblingGroup: X)   (siblingGroup: X)
    |         |
    +----+----+
         |
   CompareView (side-by-side)
```

---

## Feature 4: Dark Mode Theme Overhaul (Codex Black & Gray)

### Current State

The theme system is centralized and well-architected using **Tailwind CSS v4** with CSS custom properties:

- All 17 theme colors defined in **one file**: `web/src/index.css`
- Dark mode exists (`.dark` class toggle) with a toggle button in the sidebar
- All 27+ components use Tailwind utilities (`bg-cc-bg`, `text-cc-primary`, etc.) — they auto-inherit theme changes

### Current Palette

**Light Mode** (`index.css:4-22`):
| Variable | Value | Visual |
|----------|-------|--------|
| `--color-cc-bg` | `#F5F5F0` | Warm beige |
| `--color-cc-fg` | `#1a1a18` | Near-black |
| `--color-cc-card` | `#FFFFFF` | White |
| `--color-cc-primary` | `#ae5630` | Warm rust |
| `--color-cc-primary-hover` | `#c4643a` | Light rust |
| `--color-cc-user-bubble` | `#DDD9CE` | Warm tan |
| `--color-cc-border` | `rgba(0,0,0,0.15)` | Subtle dark |
| `--color-cc-muted` | `#7d796e` | Warm gray |
| `--color-cc-sidebar` | `#EDEAE2` | Beige |
| `--color-cc-input-bg` | `#FFFFFF` | White |
| `--color-cc-code-bg` | `#1e1e1e` | Dark |
| `--color-cc-code-fg` | `#d4d4d4` | Light gray |

**Dark Mode** (`index.css:71-89`) — Keeps warm undertones and same rust primary `#ae5630`:
| Variable | Value |
|----------|-------|
| `--color-cc-bg` | `#2b2a27` (warm dark) |
| `--color-cc-sidebar` | `#252422` (warm dark) |
| `--color-cc-card` | `#1f1e1b` (warm dark) |

### Target: Codex Black & Gray

Replace warm beige/brown with cool, neutral dark tones:

**Proposed Light Mode (Cool Gray):**
| Variable | New Value | Description |
|----------|-----------|-------------|
| `--color-cc-bg` | `#F7F7F8` | Cool light gray |
| `--color-cc-fg` | `#171717` | Pure near-black |
| `--color-cc-card` | `#FFFFFF` | White |
| `--color-cc-primary` | `#3B82F6` | Blue accent (or keep neutral) |
| `--color-cc-primary-hover` | `#2563EB` | Darker blue |
| `--color-cc-user-bubble` | `#E5E7EB` | Cool light gray |
| `--color-cc-border` | `rgba(0,0,0,0.12)` | Neutral border |
| `--color-cc-muted` | `#6B7280` | Cool gray |
| `--color-cc-sidebar` | `#F0F0F2` | Cool gray sidebar |
| `--color-cc-input-bg` | `#FFFFFF` | White |

**Proposed Dark Mode (Codex Black):**
| Variable | New Value | Description |
|----------|-----------|-------------|
| `--color-cc-bg` | `#0D0D0D` | Near-black |
| `--color-cc-fg` | `#E5E5E5` | Light gray text |
| `--color-cc-card` | `#161616` | Very dark gray |
| `--color-cc-primary` | `#3B82F6` | Blue accent |
| `--color-cc-primary-hover` | `#60A5FA` | Lighter blue |
| `--color-cc-user-bubble` | `#262626` | Dark gray |
| `--color-cc-border` | `rgba(255,255,255,0.10)` | Subtle white |
| `--color-cc-muted` | `#737373` | Neutral gray |
| `--color-cc-sidebar` | `#111111` | Near-black sidebar |
| `--color-cc-input-bg` | `#1A1A1A` | Dark input |
| `--color-cc-code-bg` | `#0A0A0A` | Almost pure black |
| `--color-cc-code-fg` | `#D4D4D4` | Light gray code text |
| `--color-cc-hover` | `rgba(255,255,255,0.05)` | Subtle hover |
| `--color-cc-active` | `rgba(255,255,255,0.08)` | Subtle active |
| `--color-cc-success` | `#4ADE80` | Bright green |
| `--color-cc-error` | `#F87171` | Bright red |
| `--color-cc-warning` | `#FBBF24` | Bright amber |

### Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `web/src/index.css` | Update all 30+ CSS variables (light + dark) | Primary — 1 file |
| `web/src/components/Sidebar.tsx` | Replace `amber-500`, `red-500` hardcoded colors | Minor |
| `web/src/components/HomePage.tsx` | Replace `amber-500`, `green-500`, `blue-500` hardcodes | Minor |
| `web/src/components/SessionItem.tsx` | Replace `blue-500`, `#5BA8A0`, `green-500`, `red-400` | Minor |

**All other 24+ component files auto-inherit** from the CSS variables. No changes needed.

### Implementation Approach

1. Update CSS variables in `index.css` (both light and dark blocks)
2. Replace hardcoded Tailwind color classes in the 3 component files
3. Test both light and dark modes across all views
4. Consider making the current "Claude Beige" an optional theme for users who prefer it

---

## Implementation Priority

| Priority | Feature | Branch | Effort | Dependencies |
|----------|---------|--------|--------|-------------|
| 1 | Dark Mode Theme Overhaul | `claude/feat-dark-theme-*` | Small | None |
| 2 | Sandbox & YOLO Mode | `claude/feat-sandbox-yolo-*` | Medium | None |
| 3 | Dual-Launch with Worktrees | `claude/feat-dual-launch-*` | Large | Backend detection working |
| 4 | SDK Integration Hardening | `claude/feat-sdk-hardening-*` | Medium | Protocol documentation |
