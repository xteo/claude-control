import { useState } from "react";
import type { TeamMember } from "../team-types.js";

interface TeamGroupProps {
  teamName: string;
  leadSessionId: string;
  members: TeamMember[];
  taskProgress: { completed: number; total: number };
  isCollapsed: boolean;
  onToggleCollapse: (teamName: string) => void;
  onSelectSession?: (id: string) => void;
  currentSessionId: string | null;
  leadSessionName?: string;
}

const STATUS_DOT: Record<TeamMember["status"], string> = {
  active: "bg-cc-success",
  spawning: "bg-cc-warning animate-pulse",
  idle: "bg-cc-success/40",
  shutdown: "bg-cc-muted/40",
};

export function TeamGroup({
  teamName,
  leadSessionId,
  members,
  taskProgress,
  isCollapsed,
  onToggleCollapse,
  onSelectSession,
  currentSessionId,
  leadSessionName,
}: TeamGroupProps) {
  const isLeadActive = currentSessionId === leadSessionId;

  return (
    <div className="mt-1 pt-1 border-t border-cc-border/50">
      {/* Group header */}
      <button
        onClick={() => onToggleCollapse(teamName)}
        className="w-full px-2 py-1.5 flex items-center gap-1.5 hover:bg-cc-hover rounded-md transition-colors cursor-pointer"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 text-cc-muted transition-transform ${isCollapsed ? "" : "rotate-90"}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        {/* Team icon */}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 text-cc-primary/70 shrink-0">
          <circle cx="6" cy="5" r="2" />
          <circle cx="11" cy="5" r="2" />
          <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4M7 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        </svg>
        <span className="text-[11px] font-semibold text-cc-fg/80 truncate">
          {teamName}
        </span>
        {/* Task progress badge */}
        {taskProgress.total > 0 && (
          <span className="text-[10px] text-cc-muted ml-auto shrink-0 tabular-nums">
            {taskProgress.completed}/{taskProgress.total}
          </span>
        )}
        <span className="text-[10px] text-cc-muted/60 shrink-0 ml-1">
          {members.length + 1}
        </span>
      </button>

      {/* Member list */}
      {!isCollapsed && (
        <div className="space-y-0.5 mt-0.5">
          {/* Lead session */}
          <button
            onClick={() => onSelectSession?.(leadSessionId)}
            className={`w-full pl-5 pr-3 py-1.5 text-left rounded-lg transition-all duration-100 cursor-pointer flex items-center gap-2 ${
              isLeadActive ? "bg-cc-active" : "hover:bg-cc-hover"
            }`}
          >
            {/* Star icon for lead */}
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-cc-warning shrink-0">
              <path d="M8 1.25l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.67l-4.12 2.17.79-4.58L1.34 6.01l4.6-.67L8 1.25z" />
            </svg>
            <span className="text-[12px] font-medium text-cc-fg truncate">
              {leadSessionName || "team-lead"}
            </span>
            <span className="ml-auto shrink-0">
              <span className="block w-2 h-2 rounded-full bg-cc-success" />
            </span>
          </button>

          {/* Teammate rows */}
          {members.map((member) => (
            <div
              key={member.name}
              className="pl-5 pr-3 py-1.5 flex items-center gap-2"
            >
              {/* Tree connector */}
              <span className="text-cc-muted/30 text-[11px] leading-none select-none shrink-0">
                {member === members[members.length - 1] ? "\u2514" : "\u251C"}
              </span>
              <span className="text-[12px] text-cc-fg/70 truncate flex-1">
                {member.name}
              </span>
              {member.agentType && (
                <span className="text-[9px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 shrink-0">
                  {member.agentType}
                </span>
              )}
              <span className="shrink-0">
                <span className={`block w-2 h-2 rounded-full ${STATUS_DOT[member.status]}`} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
