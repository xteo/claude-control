import { useState, useMemo } from "react";
import type { ThreadTurn } from "../utils/thread-grouping.js";
import { MessageBubble } from "./MessageBubble.js";
import { getToolLabel } from "./ToolBlock.js";

function formatDuration(ms: number): string {
  if (ms <= 0) return "";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`;
}

/**
 * Renders a single turn in Thread Mode:
 * 1. User message (normal bubble)
 * 2. Collapsible work trace (summary card)
 * 3. Final answer (normal bubble)
 */
export function ThreadTurnGroup({ turn }: { turn: ThreadTurn }) {
  const [expanded, setExpanded] = useState(false);
  const { userMessage, workTrace, finalAnswer, stats } = turn;

  // Build the top tool names for the summary (max 3)
  const topTools = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of stats.toolNames) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => getToolLabel(name));
  }, [stats.toolNames]);

  const hasWorkTrace = workTrace.length > 0;
  const showWorkTrace = hasWorkTrace || stats.toolCallCount > 0;

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* User message — always shown */}
      <MessageBubble message={userMessage} />

      {/* Work trace — collapsible summary card */}
      {showWorkTrace && (
        <div className="animate-[fadeSlideIn_0.2s_ease-out]">
          <div className="flex items-start gap-3">
            {/* Avatar area (for alignment) */}
            <div className="w-6 shrink-0" />

            {/* Summary card */}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left group/trace cursor-pointer"
              >
                <div
                  className={`
                    border rounded-xl overflow-hidden transition-all duration-200
                    ${expanded
                      ? "border-cc-border bg-cc-card"
                      : "border-cc-border/60 bg-cc-card/50 hover:bg-cc-card hover:border-cc-border"
                    }
                  `}
                >
                  {/* Summary bar */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* Chevron */}
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className={`w-3 h-3 text-cc-muted transition-transform duration-200 shrink-0 ${expanded ? "rotate-90" : ""}`}
                    >
                      <path d="M6 4l4 4-4 4" />
                    </svg>

                    {/* Activity indicator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-cc-primary/70">
                        <path d="M2 8h2l1.5-3 2 6 1.5-3H14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Stats pills */}
                    <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                      {/* Message count */}
                      {stats.messageCount > 0 && (
                        <span className="text-[10px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 tabular-nums font-medium shrink-0">
                          {stats.messageCount} msg{stats.messageCount !== 1 ? "s" : ""}
                        </span>
                      )}

                      {/* Tool call count */}
                      {stats.toolCallCount > 0 && (
                        <span className="text-[10px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 tabular-nums font-medium shrink-0">
                          {stats.toolCallCount} tool{stats.toolCallCount !== 1 ? "s" : ""}
                        </span>
                      )}

                      {/* Thinking blocks */}
                      {stats.thinkingBlockCount > 0 && (
                        <span className="text-[10px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 tabular-nums font-medium shrink-0">
                          {stats.thinkingBlockCount} thinking
                        </span>
                      )}

                      {/* Duration */}
                      {stats.durationMs > 0 && (
                        <span className="text-[10px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 tabular-nums font-medium shrink-0">
                          {formatDuration(stats.durationMs)}
                        </span>
                      )}

                      {/* Top tools used (when collapsed) */}
                      {!expanded && topTools.length > 0 && (
                        <span className="text-[10px] text-cc-muted/60 truncate ml-auto font-mono-code hidden sm:inline">
                          {topTools.join(" · ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded: full work trace */}
                  {expanded && (
                    <div
                      className="border-t border-cc-border px-3 py-3 space-y-3 sm:space-y-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {workTrace.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final answer — always shown */}
      {finalAnswer && <MessageBubble message={finalAnswer} />}
    </div>
  );
}
