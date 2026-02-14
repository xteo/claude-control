import { useStore } from "../store.js";

export function TeamBreadcrumb({ sessionId }: { sessionId: string }) {
  const teamInfo = useStore((s) => s.teamsBySession.get(sessionId));

  if (!teamInfo) return null;

  const activeCount = teamInfo.members.filter((m) => m.status === "active").length;

  return (
    <div className="shrink-0 px-4 py-1.5 bg-cc-primary/5 border-b border-cc-primary/10 flex items-center gap-2">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-cc-primary/60 shrink-0">
        <circle cx="6" cy="5" r="2" />
        <circle cx="11" cy="5" r="2" />
        <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4M7 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      </svg>
      <span className="text-[11px] font-medium text-cc-primary/80">
        Team: {teamInfo.teamName}
      </span>
      <span className="text-[10px] text-cc-muted">
        {activeCount}/{teamInfo.members.length} active
      </span>
    </div>
  );
}
