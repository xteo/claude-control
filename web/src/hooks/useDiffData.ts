import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "../store.js";
import { api } from "../api.js";
import type { DiffFileInfo } from "../lib/diff-stats.js";
import { parseDiffStats } from "../lib/diff-stats.js";

export type DiffScope = "uncommitted" | "branch" | "last_turn";

interface DiffData {
  files: DiffFileInfo[];
  /** Map from fileName → unified diff string */
  diffs: Map<string, string>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDiffData(
  sessionId: string,
  scope: DiffScope,
  cwd: string | undefined,
): DiffData {
  const [files, setFiles] = useState<DiffFileInfo[]>([]);
  const [diffs, setDiffs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const lastTurnFiles = useStore((s) => s.lastTurnChangedFiles.get(sessionId));

  const doFetch = useCallback(async () => {
    if (!cwd) return;
    const version = ++versionRef.current;

    setLoading(true);
    setError(null);

    try {
      if (scope === "uncommitted") {
        const res = await api.getUncommittedDiff(cwd);
        if (version !== versionRef.current) return;
        setFiles(parseDiffStats(res.stats));
        // Build per-file diff map from the combined diff
        setDiffs(splitDiffByFile(res.diff));
      } else if (scope === "branch") {
        const res = await api.getBranchDiff(cwd);
        if (version !== versionRef.current) return;
        setFiles(parseDiffStats(res.stats));
        setDiffs(splitDiffByFile(res.diff));
      } else if (scope === "last_turn") {
        // Frontend-only: fetch individual diffs for files changed in last turn
        const filePaths = lastTurnFiles ? [...lastTurnFiles] : [];
        if (filePaths.length === 0) {
          setFiles([]);
          setDiffs(new Map());
        } else {
          const results = await Promise.all(
            filePaths.map(async (fp) => {
              try {
                const res = await api.getFileDiff(fp);
                return { path: fp, diff: res.diff };
              } catch {
                return { path: fp, diff: "" };
              }
            }),
          );
          if (version !== versionRef.current) return;

          const diffMap = new Map<string, string>();
          const fileInfos: DiffFileInfo[] = [];
          for (const r of results) {
            // Derive relative path from cwd
            const rel = r.path.startsWith(cwd + "/")
              ? r.path.slice(cwd.length + 1)
              : r.path;
            diffMap.set(rel, r.diff);
            const stats = countDiffStats(r.diff);
            fileInfos.push({
              fileName: rel,
              status: stats.additions > 0 && stats.deletions === 0 ? "added" : stats.deletions > 0 && stats.additions === 0 ? "deleted" : "modified",
              additions: stats.additions,
              deletions: stats.deletions,
            });
          }
          setFiles(fileInfos);
          setDiffs(diffMap);
        }
      }
    } catch (e) {
      if (version !== versionRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to fetch diffs");
      setFiles([]);
      setDiffs(new Map());
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
      }
    }
  }, [cwd, scope, lastTurnFiles, sessionId]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { files, diffs, loading, error, refresh: doFetch };
}

/** Split a combined multi-file git diff into per-file diffs */
function splitDiffByFile(combinedDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!combinedDiff) return result;

  const lines = combinedDiff.split("\n");
  let currentFile = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (currentFile && currentLines.length > 0) {
        result.set(currentFile, currentLines.join("\n"));
      }
      currentFile = "";
      currentLines = [line];
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      currentLines.push(line);
      continue;
    }
    currentLines.push(line);
  }

  if (currentFile && currentLines.length > 0) {
    result.set(currentFile, currentLines.join("\n"));
  }

  return result;
}

/** Count additions/deletions from a unified diff string */
function countDiffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}
