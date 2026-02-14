import type { ChatMessage, ContentBlock } from "../types.js";

/**
 * Thread Mode: Groups messages into "turns" for a cleaner conversation view.
 *
 * A turn = user prompt → work trace (collapsed) → final answer
 *
 * The work trace contains all intermediate assistant messages (tool calls,
 * thinking, intermediate text). The "final answer" is the last assistant
 * message in the turn that contains meaningful text content.
 */

export interface TurnStats {
  /** Number of assistant messages in the work trace */
  messageCount: number;
  /** Total tool_use blocks across all work trace messages */
  toolCallCount: number;
  /** Total thinking blocks */
  thinkingBlockCount: number;
  /** Duration from user message to last message in turn (ms) */
  durationMs: number;
  /** Unique tool names used */
  toolNames: string[];
}

export interface ThreadTurn {
  /** The user message that started this turn */
  userMessage: ChatMessage;
  /** All intermediate messages between user prompt and final answer */
  workTrace: ChatMessage[];
  /** The final assistant answer (last text-bearing assistant message), or null if still working */
  finalAnswer: ChatMessage | null;
  /** Aggregated stats for the work trace */
  stats: TurnStats;
}

/**
 * Check if a message has meaningful text content (not just tool calls).
 * A "final answer" is an assistant message with actual text the user cares about.
 */
function hasTextContent(msg: ChatMessage): boolean {
  if (msg.role !== "assistant") return false;

  // Check contentBlocks first (preferred)
  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    return msg.contentBlocks.some(
      (b) => b.type === "text" && b.text.trim().length > 0,
    );
  }

  // Fallback to raw content
  return Boolean(msg.content && msg.content.trim().length > 0);
}

/**
 * Count tool_use blocks in a message.
 */
function countToolCalls(msg: ChatMessage): number {
  if (!msg.contentBlocks) return 0;
  return msg.contentBlocks.filter((b) => b.type === "tool_use").length;
}

/**
 * Count thinking blocks in a message.
 */
function countThinkingBlocks(msg: ChatMessage): number {
  if (!msg.contentBlocks) return 0;
  return msg.contentBlocks.filter((b) => b.type === "thinking").length;
}

/**
 * Get unique tool names from a message.
 */
function getToolNames(msg: ChatMessage): string[] {
  if (!msg.contentBlocks) return [];
  return msg.contentBlocks
    .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
    .map((b) => b.name);
}

/**
 * Compute stats for a set of work trace messages.
 */
function computeStats(
  userMessage: ChatMessage,
  workTrace: ChatMessage[],
  finalAnswer: ChatMessage | null,
): TurnStats {
  const allMessages = [...workTrace, ...(finalAnswer ? [finalAnswer] : [])];
  const lastMsg = allMessages[allMessages.length - 1];

  const toolNameSet = new Set<string>();
  let toolCallCount = 0;
  let thinkingBlockCount = 0;

  for (const msg of workTrace) {
    toolCallCount += countToolCalls(msg);
    thinkingBlockCount += countThinkingBlocks(msg);
    for (const name of getToolNames(msg)) {
      toolNameSet.add(name);
    }
  }

  return {
    messageCount: workTrace.length,
    toolCallCount,
    thinkingBlockCount,
    durationMs: lastMsg ? lastMsg.timestamp - userMessage.timestamp : 0,
    toolNames: Array.from(toolNameSet),
  };
}

/**
 * Group a flat list of messages into ThreadTurns.
 *
 * Strategy:
 * 1. Walk messages in order
 * 2. Each user message starts a new turn
 * 3. All assistant/system messages after the user message belong to that turn
 * 4. The last assistant message with text content is the "final answer"
 * 5. Everything else in between is the "work trace"
 *
 * Messages before the first user message (e.g. system init) are grouped
 * into a special "preamble" turn with no user message.
 *
 * Note: We filter out messages with parentToolUseId (subagent children)
 * from the top level — they're handled within the subagent grouping.
 */
export function groupIntoThreadTurns(messages: ChatMessage[]): ThreadTurn[] {
  const turns: ThreadTurn[] = [];

  // Filter to top-level messages only (no subagent children)
  const topLevel = messages.filter((m) => !m.parentToolUseId);

  let currentTurn: {
    userMessage: ChatMessage;
    assistantMessages: ChatMessage[];
  } | null = null;

  for (const msg of topLevel) {
    if (msg.role === "user") {
      // Finalize previous turn if any
      if (currentTurn) {
        turns.push(finalizeTurn(currentTurn.userMessage, currentTurn.assistantMessages));
      }
      // Start new turn
      currentTurn = { userMessage: msg, assistantMessages: [] };
    } else if (msg.role === "system" && msg.content?.includes("Session started")) {
      // Skip system init messages — don't start a turn for them
      continue;
    } else {
      if (currentTurn) {
        currentTurn.assistantMessages.push(msg);
      }
      // Messages before first user message are ignored in thread mode
      // (they're typically system init messages)
    }
  }

  // Finalize last turn
  if (currentTurn) {
    turns.push(finalizeTurn(currentTurn.userMessage, currentTurn.assistantMessages));
  }

  return turns;
}

/**
 * Split assistant messages into work trace + final answer.
 */
function finalizeTurn(
  userMessage: ChatMessage,
  assistantMessages: ChatMessage[],
): ThreadTurn {
  // Find the last assistant message with actual text content
  let finalAnswerIdx = -1;
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    if (hasTextContent(assistantMessages[i])) {
      finalAnswerIdx = i;
      break;
    }
  }

  let finalAnswer: ChatMessage | null = null;
  let workTrace: ChatMessage[];

  if (finalAnswerIdx >= 0) {
    finalAnswer = assistantMessages[finalAnswerIdx];
    // Work trace = everything before the final answer
    workTrace = assistantMessages.slice(0, finalAnswerIdx);
  } else {
    // No text answer yet — everything is work trace (still working)
    workTrace = assistantMessages;
  }

  const stats = computeStats(userMessage, workTrace, finalAnswer);

  return { userMessage, workTrace, finalAnswer, stats };
}
