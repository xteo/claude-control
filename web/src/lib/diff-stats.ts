/** Structured info about a single file in a diff */
export interface DiffFileInfo {
  fileName: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

/**
 * Parse combined numstat + name-status git output into DiffFileInfo[].
 * Expected format from the server endpoints:
 *   stats: Array<{ file, additions, deletions, status }>
 */
export function parseDiffStats(
  stats: Array<{ file: string; additions: number; deletions: number; status: string }>,
): DiffFileInfo[] {
  return stats.map((s) => ({
    fileName: s.file,
    status: statusChar(s.status),
    additions: s.additions,
    deletions: s.deletions,
  }));
}

function statusChar(raw: string): DiffFileInfo["status"] {
  const c = raw.charAt(0).toUpperCase();
  if (c === "A") return "added";
  if (c === "D") return "deleted";
  return "modified";
}
