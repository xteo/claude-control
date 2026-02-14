import { useState } from "react";

export interface TeamMessageBlockProps {
  from: string;
  to: string | null; // null = broadcast
  content: string;
  summary?: string;
  messageType: string; // "message" | "broadcast" | "shutdown_request" etc.
  timestamp?: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function TeamMessageBlock({
  from,
  to,
  content,
  messageType,
  timestamp,
}: TeamMessageBlockProps) {
  const isLong = content.length > 200;
  const [expanded, setExpanded] = useState(!isLong);

  const isShutdown = messageType === "shutdown_request" || messageType === "shutdown_response";
  const isBroadcast = messageType === "broadcast" || to === null;

  // Build the header arrow text
  const recipientLabel = isBroadcast ? "all" : to;
  const arrow = "\u2192"; // →

  // Container styling
  const containerCls = isShutdown
    ? "bg-amber-500/5 border-l-2 border-amber-500/40 rounded-r-lg px-3 py-2"
    : "bg-cc-primary/5 border-l-2 border-cc-primary/30 rounded-r-lg px-3 py-2";

  const displayContent = !expanded ? content.slice(0, 200) + "..." : content;

  return (
    <div className={containerCls}>
      {/* Header: from → to */}
      <div className="flex items-center gap-1 mb-1">
        <span className={`text-[11px] font-medium ${isShutdown ? "text-amber-600 dark:text-amber-400" : "text-cc-muted"}`}>
          {from}
        </span>
        <span className={`text-[11px] ${isShutdown ? "text-amber-500/60" : "text-cc-muted/60"}`}>
          {arrow}
        </span>
        <span className={`text-[11px] font-medium ${isShutdown ? "text-amber-600 dark:text-amber-400" : "text-cc-muted"}`}>
          {recipientLabel}
        </span>
        {isShutdown && (
          <span className="text-[9px] font-medium px-1.5 rounded-full leading-[16px] bg-amber-500/10 text-amber-600 dark:text-amber-400 ml-1">
            {messageType === "shutdown_request" ? "shutdown" : "response"}
          </span>
        )}
        {isBroadcast && !isShutdown && (
          <span className="text-[9px] font-medium px-1.5 rounded-full leading-[16px] bg-cc-primary/10 text-cc-primary ml-1">
            broadcast
          </span>
        )}
      </div>

      {/* Content */}
      <div className="text-[13px] text-cc-fg leading-relaxed whitespace-pre-wrap break-words">
        {displayContent}
      </div>

      {/* Show more/less toggle for long content */}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-cc-primary hover:underline mt-1 cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Timestamp */}
      {timestamp && (
        <div className="flex justify-end mt-1">
          <span className={`text-[10px] ${isShutdown ? "text-amber-500/50" : "text-cc-muted/50"}`}>
            {formatTime(timestamp)}
          </span>
        </div>
      )}
    </div>
  );
}
