import { describe, it, expect } from "vitest";
import { groupIntoThreadTurns, type ThreadTurn } from "./thread-grouping.js";
import type { ChatMessage } from "../types.js";

function makeMsg(
  overrides: Partial<ChatMessage> & { role: ChatMessage["role"] },
): ChatMessage {
  const { role, content, contentBlocks, timestamp, parentToolUseId, ...rest } = overrides;
  return {
    id: Math.random().toString(36).slice(2),
    role,
    content: content || "",
    contentBlocks: contentBlocks || [],
    timestamp: timestamp || Date.now(),
    parentToolUseId: parentToolUseId ?? undefined,
    ...rest,
  };
}

describe("groupIntoThreadTurns", () => {
  it("returns empty array for no messages", () => {
    expect(groupIntoThreadTurns([])).toEqual([]);
  });

  it("groups a simple user → assistant conversation into one turn", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Hello", timestamp: 1000 }),
      makeMsg({ role: "assistant", content: "Hi there!", timestamp: 2000,
        contentBlocks: [{ type: "text", text: "Hi there!" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage.content).toBe("Hello");
    expect(turns[0].finalAnswer?.content).toBe("Hi there!");
    expect(turns[0].workTrace).toHaveLength(0);
  });

  it("separates work trace from final answer", () => {
    // User asks something, Claude does tool calls, then gives a text answer
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Find bugs", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 2000,
        contentBlocks: [
          { type: "tool_use", id: "t1", name: "Read", input: { path: "/foo" } },
        ],
      }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 3000,
        contentBlocks: [
          { type: "tool_use", id: "t2", name: "Grep", input: { pattern: "bug" } },
        ],
      }),
      makeMsg({
        role: "assistant",
        content: "I found 2 bugs in the code.",
        timestamp: 4000,
        contentBlocks: [{ type: "text", text: "I found 2 bugs in the code." }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(1);

    const turn = turns[0];
    expect(turn.userMessage.content).toBe("Find bugs");
    expect(turn.workTrace).toHaveLength(2); // Two tool-only messages
    expect(turn.finalAnswer?.content).toBe("I found 2 bugs in the code.");
    expect(turn.stats.toolCallCount).toBe(2);
    expect(turn.stats.messageCount).toBe(2);
    expect(turn.stats.toolNames).toContain("Read");
    expect(turn.stats.toolNames).toContain("Grep");
  });

  it("handles multiple turns correctly", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Question 1", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "Answer 1",
        timestamp: 2000,
        contentBlocks: [{ type: "text", text: "Answer 1" }],
      }),
      makeMsg({ role: "user", content: "Question 2", timestamp: 3000 }),
      makeMsg({
        role: "assistant",
        content: "Answer 2",
        timestamp: 4000,
        contentBlocks: [{ type: "text", text: "Answer 2" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(2);
    expect(turns[0].userMessage.content).toBe("Question 1");
    expect(turns[0].finalAnswer?.content).toBe("Answer 1");
    expect(turns[1].userMessage.content).toBe("Question 2");
    expect(turns[1].finalAnswer?.content).toBe("Answer 2");
  });

  it("computes duration correctly", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Do it", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 3000,
        contentBlocks: [
          { type: "tool_use", id: "t1", name: "Edit", input: {} },
        ],
      }),
      makeMsg({
        role: "assistant",
        content: "Done!",
        timestamp: 11000,
        contentBlocks: [{ type: "text", text: "Done!" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    // Duration = last message timestamp - user message timestamp
    expect(turns[0].stats.durationMs).toBe(10000); // 11000 - 1000
  });

  it("handles a turn with no final answer (still working)", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Build it", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 2000,
        contentBlocks: [
          { type: "tool_use", id: "t1", name: "Write", input: {} },
        ],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(1);
    expect(turns[0].finalAnswer).toBeNull();
    expect(turns[0].workTrace).toHaveLength(1);
  });

  it("skips subagent child messages (parentToolUseId)", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Question", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 2000,
        contentBlocks: [
          { type: "tool_use", id: "task-1", name: "Task", input: { description: "sub" } },
        ],
      }),
      // Subagent child message — should be skipped
      makeMsg({
        role: "assistant",
        content: "subagent output",
        timestamp: 2500,
        parentToolUseId: "task-1",
        contentBlocks: [{ type: "text", text: "subagent output" }],
      }),
      makeMsg({
        role: "assistant",
        content: "Final answer with subagent result",
        timestamp: 3000,
        contentBlocks: [{ type: "text", text: "Final answer with subagent result" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(1);
    // Subagent child should NOT appear in work trace
    expect(turns[0].workTrace).toHaveLength(1); // Only the Task tool_use message
    expect(turns[0].finalAnswer?.content).toBe("Final answer with subagent result");
  });

  it("counts thinking blocks in stats", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Think about this", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "",
        timestamp: 2000,
        contentBlocks: [
          { type: "thinking", thinking: "Let me think..." },
          { type: "tool_use", id: "t1", name: "Read", input: {} },
        ],
      }),
      makeMsg({
        role: "assistant",
        content: "Here's what I think.",
        timestamp: 3000,
        contentBlocks: [{ type: "text", text: "Here's what I think." }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns[0].stats.thinkingBlockCount).toBe(1);
    expect(turns[0].stats.toolCallCount).toBe(1);
  });

  it("ignores system init messages before first user message", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "system", content: "Session started", timestamp: 500 }),
      makeMsg({ role: "user", content: "Hello", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "Hi!",
        timestamp: 2000,
        contentBlocks: [{ type: "text", text: "Hi!" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage.content).toBe("Hello");
  });

  it("handles messages with only whitespace text as non-text", () => {
    const msgs: ChatMessage[] = [
      makeMsg({ role: "user", content: "Do work", timestamp: 1000 }),
      makeMsg({
        role: "assistant",
        content: "   ",
        timestamp: 2000,
        contentBlocks: [{ type: "text", text: "   " }],
      }),
      makeMsg({
        role: "assistant",
        content: "Real answer",
        timestamp: 3000,
        contentBlocks: [{ type: "text", text: "Real answer" }],
      }),
    ];

    const turns = groupIntoThreadTurns(msgs);
    expect(turns[0].workTrace).toHaveLength(1); // Whitespace-only goes to work trace
    expect(turns[0].finalAnswer?.content).toBe("Real answer");
  });
});
