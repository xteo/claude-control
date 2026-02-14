/** Information about a team detected from tool_use blocks */
export interface TeamInfo {
  teamName: string;
  leadSessionId: string;
  members: TeamMember[];
  createdAt: number;
}

export interface TeamMember {
  name: string;
  agentType: string;
  status: "spawning" | "active" | "idle" | "shutdown";
  description?: string;
}

/** Inter-agent message extracted from SendMessage tool_use blocks */
export interface TeamMessage {
  id: string;
  from: string;
  to: string | null; // null = broadcast
  content: string;
  summary: string;
  timestamp: number;
  messageType: "message" | "broadcast" | "shutdown_request" | "shutdown_response";
}
