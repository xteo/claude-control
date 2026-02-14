/**
 * Type-level tests for team-types.ts.
 *
 * These tests verify that the TeamInfo, TeamMember, and TeamMessage types
 * are importable, structurally correct, and accept the expected values.
 * Uses `satisfies` to catch structural regressions at compile time.
 */

import { describe, it, expect } from "vitest";
import type { TeamInfo, TeamMember, TeamMessage } from "./team-types.js";

describe("TeamMember type", () => {
  it("accepts all valid status values", () => {
    // Each status literal must be assignable to TeamMember["status"]
    const spawning = { name: "a", agentType: "Explore", status: "spawning" as const } satisfies TeamMember;
    const active = { name: "b", agentType: "Code", status: "active" as const } satisfies TeamMember;
    const idle = { name: "c", agentType: "Review", status: "idle" as const } satisfies TeamMember;
    const shutdown = { name: "d", agentType: "Test", status: "shutdown" as const } satisfies TeamMember;

    expect(spawning.status).toBe("spawning");
    expect(active.status).toBe("active");
    expect(idle.status).toBe("idle");
    expect(shutdown.status).toBe("shutdown");
  });

  it("accepts optional description field", () => {
    const withDesc = {
      name: "researcher",
      agentType: "Explore",
      status: "active" as const,
      description: "Researches codebase",
    } satisfies TeamMember;

    const withoutDesc = {
      name: "coder",
      agentType: "Code",
      status: "active" as const,
    } satisfies TeamMember;

    expect(withDesc.description).toBe("Researches codebase");
    expect((withoutDesc as TeamMember).description).toBeUndefined();
  });
});

describe("TeamInfo type", () => {
  it("has the expected structure", () => {
    const info = {
      teamName: "alpha-team",
      leadSessionId: "session-abc",
      members: [
        { name: "coder", agentType: "Code", status: "active" as const },
      ],
      createdAt: 1707900000000,
    } satisfies TeamInfo;

    expect(info.teamName).toBe("alpha-team");
    expect(info.leadSessionId).toBe("session-abc");
    expect(info.members).toHaveLength(1);
    expect(typeof info.createdAt).toBe("number");
  });

  it("allows empty members array", () => {
    const info = {
      teamName: "empty-team",
      leadSessionId: "s1",
      members: [],
      createdAt: Date.now(),
    } satisfies TeamInfo;

    expect(info.members).toEqual([]);
  });
});

describe("TeamMessage type", () => {
  it("accepts direct message (to is a string)", () => {
    const msg = {
      id: "msg-1",
      from: "team-lead",
      to: "researcher",
      content: "Please check the logs",
      summary: "Check logs",
      timestamp: Date.now(),
      messageType: "message" as const,
    } satisfies TeamMessage;

    expect(msg.to).toBe("researcher");
    expect(msg.messageType).toBe("message");
  });

  it("accepts broadcast message (to is null)", () => {
    const msg = {
      id: "msg-2",
      from: "team-lead",
      to: null,
      content: "All stop",
      summary: "Stop all work",
      timestamp: Date.now(),
      messageType: "broadcast" as const,
    } satisfies TeamMessage;

    expect(msg.to).toBeNull();
    expect(msg.messageType).toBe("broadcast");
  });

  it("accepts all messageType values", () => {
    const types: TeamMessage["messageType"][] = [
      "message",
      "broadcast",
      "shutdown_request",
      "shutdown_response",
    ];

    // Verify each type is a valid string (compile-time check via satisfies above,
    // runtime check here for completeness)
    expect(types).toHaveLength(4);
    for (const t of types) {
      expect(typeof t).toBe("string");
    }
  });
});
