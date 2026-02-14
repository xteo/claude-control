import type { TeamMember, TeamMessage } from "../team-types.js";

interface TeamOverviewProps {
  teamName: string;
  members: TeamMember[];
  messages: TeamMessage[];
  taskProgress: { completed: number; total: number };
}

const STATUS_LABEL: Record<TeamMember["status"], { text: string; cls: string }> = {
  active: { text: "active", cls: "text-cc-success" },
  spawning: { text: "spawning", cls: "text-cc-warning" },
  idle: { text: "idle", cls: "text-cc-muted" },
  shutdown: { text: "shutdown", cls: "text-cc-muted/50" },
};

const STATUS_DOT: Record<TeamMember["status"], string> = {
  active: "bg-cc-success",
  spawning: "bg-cc-warning animate-pulse",
  idle: "bg-cc-success/40",
  shutdown: "bg-cc-muted/40",
};

export function TeamOverview({
  teamName,
  members,
  messages,
  taskProgress,
}: TeamOverviewProps) {
  const recentMessages = messages.slice(-5);

  return (
    <div className="border border-cc-border rounded-xl overflow-hidden bg-cc-card">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-cc-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-cc-fg flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-cc-muted">
            <circle cx="6" cy="5" r="2" />
            <circle cx="11" cy="5" r="2" />
            <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4M7 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
          </svg>
          Team: {teamName}
        </span>
        {taskProgress.total > 0 && (
          <span className="text-[11px] text-cc-muted tabular-nums">
            {taskProgress.completed}/{taskProgress.total}
          </span>
        )}
      </div>

      {/* Members */}
      <div className="px-4 py-3 border-b border-cc-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-cc-muted uppercase tracking-wider">Members</span>
          <span className="text-[11px] text-cc-muted tabular-nums">
            {members.filter((m) => m.status === "active").length}/{members.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {members.map((member) => {
            const status = STATUS_LABEL[member.status];
            const dot = STATUS_DOT[member.status];
            return (
              <div key={member.name} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                <span className="text-[12px] text-cc-fg truncate flex-1">{member.name}</span>
                <span className={`text-[11px] ${status.cls}`}>{status.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent messages */}
      {recentMessages.length > 0 && (
        <div className="px-4 py-3">
          <span className="text-[11px] text-cc-muted uppercase tracking-wider mb-2 block">
            Recent Messages
          </span>
          <div className="space-y-1.5">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-1 text-[11px] text-cc-muted leading-snug">
                <span className="font-medium text-cc-fg/70 shrink-0">{msg.from}</span>
                <span className="text-cc-muted/40 shrink-0">{"\u2192"}</span>
                <span className="font-medium text-cc-fg/70 shrink-0">{msg.to || "all"}</span>
                <span className="text-cc-muted/40 shrink-0">:</span>
                <span className="truncate">{msg.summary || msg.content.slice(0, 50)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
