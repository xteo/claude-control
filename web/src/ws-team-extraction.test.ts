// @vitest-environment jsdom

/**
 * Tests for team-related store actions (setTeamInfo, addTeamMember,
 * updateTeamMemberStatus, addTeamMessage, toggleTeamCollapse).
 *
 * The extraction logic in ws.ts (extractTeamInfoFromBlocks) is an unexported
 * helper, so we validate it indirectly by exercising the Zustand store actions
 * it calls. This also covers cleanup paths (removeSession, reset).
 */

vi.hoisted(() => {
  Object.defineProperty(globalThis.window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  if (
    typeof globalThis.localStorage === "undefined" ||
    typeof globalThis.localStorage.getItem !== "function"
  ) {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, String(value)); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        get length() { return store.size; },
        key: (index: number) => [...store.keys()][index] ?? null,
      },
      writable: true,
      configurable: true,
    });
  }
});

import { useStore } from "./store.js";
import type { TeamInfo, TeamMember, TeamMessage } from "./team-types.js";
import type { SessionState } from "./types.js";

function makeSession(id: string): SessionState {
  return {
    session_id: id,
    model: "claude-sonnet-4-5-20250929",
    cwd: "/test",
    tools: [],
    permissionMode: "default",
    claude_code_version: "1.0",
    mcp_servers: [],
    agents: [],
    slash_commands: [],
    skills: [],
    total_cost_usd: 0,
    num_turns: 0,
    context_used_percent: 0,
    is_compacting: false,
    git_branch: "",
    is_worktree: false,
    repo_root: "",
    git_ahead: 0,
    git_behind: 0,
    total_lines_added: 0,
    total_lines_removed: 0,
  };
}

function makeTeamInfo(sessionId: string, overrides: Partial<TeamInfo> = {}): TeamInfo {
  return {
    teamName: "test-team",
    leadSessionId: sessionId,
    members: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    name: "researcher",
    agentType: "Explore",
    status: "spawning",
    ...overrides,
  };
}

function makeTeamMessage(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: crypto.randomUUID(),
    from: "team-lead",
    to: "researcher",
    content: "Please investigate the bug.",
    summary: "Investigate bug",
    timestamp: Date.now(),
    messageType: "message",
    ...overrides,
  };
}

beforeEach(() => {
  useStore.getState().reset();
  localStorage.clear();
});

// ─── setTeamInfo ──────────────────────────────────────────────────────────────

describe("setTeamInfo", () => {
  it("stores team info keyed by session ID", () => {
    const info = makeTeamInfo("s1", { teamName: "alpha-team" });
    useStore.getState().setTeamInfo("s1", info);

    const stored = useStore.getState().teamsBySession.get("s1");
    expect(stored).toBeDefined();
    expect(stored!.teamName).toBe("alpha-team");
    expect(stored!.leadSessionId).toBe("s1");
    expect(stored!.members).toEqual([]);
  });

  it("overwrites previous team info for same session", () => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1", { teamName: "v1" }));
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1", { teamName: "v2" }));

    expect(useStore.getState().teamsBySession.get("s1")!.teamName).toBe("v2");
  });

  it("stores independent teams for different sessions", () => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1", { teamName: "team-a" }));
    useStore.getState().setTeamInfo("s2", makeTeamInfo("s2", { teamName: "team-b" }));

    expect(useStore.getState().teamsBySession.size).toBe(2);
    expect(useStore.getState().teamsBySession.get("s1")!.teamName).toBe("team-a");
    expect(useStore.getState().teamsBySession.get("s2")!.teamName).toBe("team-b");
  });
});

// ─── addTeamMember ────────────────────────────────────────────────────────────

describe("addTeamMember", () => {
  it("appends a member to an existing team", () => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder" }));

    const team = useStore.getState().teamsBySession.get("s1")!;
    expect(team.members).toHaveLength(1);
    expect(team.members[0].name).toBe("coder");
    expect(team.members[0].status).toBe("spawning");
  });

  it("accumulates multiple members", () => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder" }));
    useStore.getState().addTeamMember("s1", makeMember({ name: "tester" }));
    useStore.getState().addTeamMember("s1", makeMember({ name: "reviewer" }));

    const team = useStore.getState().teamsBySession.get("s1")!;
    expect(team.members).toHaveLength(3);
    expect(team.members.map((m) => m.name)).toEqual(["coder", "tester", "reviewer"]);
  });

  it("is a no-op when the session has no team info", () => {
    // No team set for "s1" — addTeamMember should not crash or create a team
    useStore.getState().addTeamMember("s1", makeMember({ name: "orphan" }));

    expect(useStore.getState().teamsBySession.has("s1")).toBe(false);
  });

  it("allows duplicate member names (no built-in dedup)", () => {
    // The store does not prevent adding a member with the same name twice.
    // This tests the current behavior — callers are responsible for dedup.
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder" }));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder" }));

    const team = useStore.getState().teamsBySession.get("s1")!;
    expect(team.members).toHaveLength(2);
  });
});

// ─── updateTeamMemberStatus ───────────────────────────────────────────────────

describe("updateTeamMemberStatus", () => {
  beforeEach(() => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder", status: "spawning" }));
    useStore.getState().addTeamMember("s1", makeMember({ name: "tester", status: "spawning" }));
  });

  it("transitions a specific member from spawning to active", () => {
    useStore.getState().updateTeamMemberStatus("s1", "coder", "active");

    const team = useStore.getState().teamsBySession.get("s1")!;
    expect(team.members.find((m) => m.name === "coder")!.status).toBe("active");
    // Other member stays unchanged
    expect(team.members.find((m) => m.name === "tester")!.status).toBe("spawning");
  });

  it("supports full lifecycle: spawning → active → idle → shutdown", () => {
    const statuses: TeamMember["status"][] = ["active", "idle", "shutdown"];
    for (const status of statuses) {
      useStore.getState().updateTeamMemberStatus("s1", "coder", status);
      const team = useStore.getState().teamsBySession.get("s1")!;
      expect(team.members.find((m) => m.name === "coder")!.status).toBe(status);
    }
  });

  it("is a no-op when session has no team info", () => {
    // Should not crash when updating a member for a nonexistent session
    useStore.getState().updateTeamMemberStatus("nonexistent", "coder", "active");
    expect(useStore.getState().teamsBySession.has("nonexistent")).toBe(false);
  });

  it("is a no-op when member name does not match any member", () => {
    useStore.getState().updateTeamMemberStatus("s1", "nonexistent-member", "active");

    const team = useStore.getState().teamsBySession.get("s1")!;
    // All members remain at their original status
    expect(team.members.every((m) => m.status === "spawning")).toBe(true);
  });
});

// ─── addTeamMessage ───────────────────────────────────────────────────────────

describe("addTeamMessage", () => {
  it("adds a message to the session's message list", () => {
    const msg = makeTeamMessage({ from: "lead", to: "coder", content: "Start work" });
    useStore.getState().addTeamMessage("s1", msg);

    const messages = useStore.getState().teamMessages.get("s1")!;
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe("lead");
    expect(messages[0].to).toBe("coder");
    expect(messages[0].content).toBe("Start work");
  });

  it("accumulates messages in order", () => {
    useStore.getState().addTeamMessage("s1", makeTeamMessage({ content: "msg1" }));
    useStore.getState().addTeamMessage("s1", makeTeamMessage({ content: "msg2" }));
    useStore.getState().addTeamMessage("s1", makeTeamMessage({ content: "msg3" }));

    const messages = useStore.getState().teamMessages.get("s1")!;
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.content)).toEqual(["msg1", "msg2", "msg3"]);
  });

  it("supports broadcast messages (to = null)", () => {
    const msg = makeTeamMessage({ to: null, messageType: "broadcast" });
    useStore.getState().addTeamMessage("s1", msg);

    const messages = useStore.getState().teamMessages.get("s1")!;
    expect(messages[0].to).toBeNull();
    expect(messages[0].messageType).toBe("broadcast");
  });

  it("supports shutdown_request messages", () => {
    const msg = makeTeamMessage({ messageType: "shutdown_request", content: "Shutting down" });
    useStore.getState().addTeamMessage("s1", msg);

    const messages = useStore.getState().teamMessages.get("s1")!;
    expect(messages[0].messageType).toBe("shutdown_request");
  });
});

// ─── toggleTeamCollapse ───────────────────────────────────────────────────────

describe("toggleTeamCollapse", () => {
  it("adds team name to collapsed set on first toggle", () => {
    useStore.getState().toggleTeamCollapse("my-team");

    expect(useStore.getState().collapsedTeams.has("my-team")).toBe(true);
  });

  it("removes team name from collapsed set on second toggle", () => {
    useStore.getState().toggleTeamCollapse("my-team");
    useStore.getState().toggleTeamCollapse("my-team");

    expect(useStore.getState().collapsedTeams.has("my-team")).toBe(false);
  });

  it("toggles independently for different team names", () => {
    useStore.getState().toggleTeamCollapse("team-a");
    useStore.getState().toggleTeamCollapse("team-b");
    useStore.getState().toggleTeamCollapse("team-a"); // un-collapse team-a

    expect(useStore.getState().collapsedTeams.has("team-a")).toBe(false);
    expect(useStore.getState().collapsedTeams.has("team-b")).toBe(true);
  });

  it("persists collapsed state to localStorage", () => {
    useStore.getState().toggleTeamCollapse("team-x");

    const stored = JSON.parse(localStorage.getItem("cc-collapsed-teams") || "[]");
    expect(stored).toContain("team-x");
  });

  it("removes from localStorage when un-collapsed", () => {
    useStore.getState().toggleTeamCollapse("team-x");
    useStore.getState().toggleTeamCollapse("team-x");

    const stored = JSON.parse(localStorage.getItem("cc-collapsed-teams") || "[]");
    expect(stored).not.toContain("team-x");
  });
});

// ─── Cleanup: removeSession clears team data ─────────────────────────────────

describe("removeSession cleans up team data", () => {
  it("removes teamsBySession entry for the session", () => {
    useStore.getState().addSession(makeSession("s1"));
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember({ name: "coder" }));

    useStore.getState().removeSession("s1");

    expect(useStore.getState().teamsBySession.has("s1")).toBe(false);
  });

  it("removes teamMessages entry for the session", () => {
    useStore.getState().addSession(makeSession("s1"));
    useStore.getState().addTeamMessage("s1", makeTeamMessage());

    useStore.getState().removeSession("s1");

    expect(useStore.getState().teamMessages.has("s1")).toBe(false);
  });

  it("does not affect other sessions' team data", () => {
    useStore.getState().addSession(makeSession("s1"));
    useStore.getState().addSession(makeSession("s2"));
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1", { teamName: "team-1" }));
    useStore.getState().setTeamInfo("s2", makeTeamInfo("s2", { teamName: "team-2" }));
    useStore.getState().addTeamMessage("s1", makeTeamMessage({ content: "for s1" }));
    useStore.getState().addTeamMessage("s2", makeTeamMessage({ content: "for s2" }));

    useStore.getState().removeSession("s1");

    expect(useStore.getState().teamsBySession.has("s1")).toBe(false);
    expect(useStore.getState().teamsBySession.get("s2")!.teamName).toBe("team-2");
    expect(useStore.getState().teamMessages.get("s2")).toHaveLength(1);
  });
});

// ─── Cleanup: reset clears all team data ──────────────────────────────────────

describe("reset clears all team data", () => {
  it("clears teamsBySession, teamMessages, and collapsedTeams", () => {
    useStore.getState().setTeamInfo("s1", makeTeamInfo("s1"));
    useStore.getState().addTeamMember("s1", makeMember());
    useStore.getState().addTeamMessage("s1", makeTeamMessage());
    useStore.getState().toggleTeamCollapse("some-team");

    useStore.getState().reset();

    const state = useStore.getState();
    expect(state.teamsBySession.size).toBe(0);
    expect(state.teamMessages.size).toBe(0);
    expect(state.collapsedTeams.size).toBe(0);
  });
});
