// @vitest-environment jsdom

/**
 * Tests for the TeamOverview component.
 *
 * Validates rendering of team name, members with status indicators,
 * recent messages, and task progress display.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TeamOverview } from "./TeamOverview.js";
import type { TeamMember, TeamMessage } from "../team-types.js";

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    name: "researcher",
    agentType: "Explore",
    status: "active",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: crypto.randomUUID(),
    from: "team-lead",
    to: "researcher",
    content: "Check the logs.",
    summary: "Check logs",
    timestamp: Date.now(),
    messageType: "message",
    ...overrides,
  };
}

describe("TeamOverview", () => {
  it("renders team name in the header", () => {
    render(
      <TeamOverview
        teamName="alpha-squad"
        members={[]}
        messages={[]}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    expect(screen.getByText(/Team:\s*alpha-squad/)).toBeInTheDocument();
  });

  it("renders all members with their names and status text", () => {
    const members = [
      makeMember({ name: "coder", status: "active" }),
      makeMember({ name: "tester", status: "spawning" }),
      makeMember({ name: "reviewer", status: "idle" }),
      makeMember({ name: "logger", status: "shutdown" }),
    ];

    render(
      <TeamOverview
        teamName="test-team"
        members={members}
        messages={[]}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // All member names visible
    expect(screen.getByText("coder")).toBeInTheDocument();
    expect(screen.getByText("tester")).toBeInTheDocument();
    expect(screen.getByText("reviewer")).toBeInTheDocument();
    expect(screen.getByText("logger")).toBeInTheDocument();

    // Status labels visible
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("spawning")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("shutdown")).toBeInTheDocument();
  });

  it("shows active/total member count", () => {
    const members = [
      makeMember({ name: "a", status: "active" }),
      makeMember({ name: "b", status: "active" }),
      makeMember({ name: "c", status: "idle" }),
    ];

    render(
      <TeamOverview
        teamName="test-team"
        members={members}
        messages={[]}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // Should show "2/3" (2 active out of 3 total)
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("renders recent messages with from/to and summary", () => {
    const messages = [
      makeMessage({ from: "lead", to: "coder", summary: "Fix the bug" }),
      makeMessage({ from: "coder", to: "lead", summary: "Bug fixed" }),
    ];

    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={messages}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // "Recent Messages" heading should appear
    expect(screen.getByText("Recent Messages")).toBeInTheDocument();
    // "lead" and "coder" appear in both messages (as from/to), so use getAllByText
    expect(screen.getAllByText("lead")).toHaveLength(2);
    expect(screen.getAllByText("coder")).toHaveLength(2);
    // Summaries
    expect(screen.getByText("Fix the bug")).toBeInTheDocument();
    expect(screen.getByText("Bug fixed")).toBeInTheDocument();
  });

  it("renders broadcast message with 'all' as recipient", () => {
    const messages = [
      makeMessage({ from: "lead", to: null, summary: "All stop", messageType: "broadcast" }),
    ];

    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={messages}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // Broadcast messages show "all" as recipient
    expect(screen.getByText("all")).toBeInTheDocument();
  });

  it("limits recent messages to last 5", () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage({ from: `agent-${i}`, summary: `summary-${i}` }),
    );

    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={messages}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // Only the last 5 messages should be rendered (indices 3-7)
    expect(screen.queryByText("summary-0")).not.toBeInTheDocument();
    expect(screen.queryByText("summary-2")).not.toBeInTheDocument();
    expect(screen.getByText("summary-3")).toBeInTheDocument();
    expect(screen.getByText("summary-7")).toBeInTheDocument();
  });

  it("does not render recent messages section when there are none", () => {
    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={[]}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    expect(screen.queryByText("Recent Messages")).not.toBeInTheDocument();
  });

  it("shows task progress when total > 0", () => {
    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={[]}
        taskProgress={{ completed: 3, total: 5 }}
      />,
    );

    // Should show "3/5" in the header
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("hides task progress when total is 0", () => {
    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={[]}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // "0/0" should not appear in the header
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });

  it("uses content prefix as fallback when summary is missing", () => {
    const messages = [
      makeMessage({
        from: "lead",
        to: "coder",
        summary: "",
        content: "This is a long message that should be truncated to first 50 characters for the preview display.",
      }),
    ];

    render(
      <TeamOverview
        teamName="test-team"
        members={[makeMember()]}
        messages={messages}
        taskProgress={{ completed: 0, total: 0 }}
      />,
    );

    // When summary is empty, the component falls back to content.slice(0, 50)
    expect(screen.getByText("This is a long message that should be truncated to")).toBeInTheDocument();
  });
});
