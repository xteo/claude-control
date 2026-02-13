import { useState, useCallback, useMemo, useEffect } from "react";
import { useStore } from "../store.js";
import { useDiffData } from "../hooks/useDiffData.js";
import type { DiffScope } from "../hooks/useDiffData.js";
import { DiffScopeSelector } from "./DiffScopeSelector.js";
import { DiffFileTree } from "./DiffFileTree.js";
import { DiffContentArea } from "./DiffContentArea.js";

export function EnhancedDiffPanel({ sessionId }: { sessionId: string }) {
  const session = useStore((s) => s.sessions.get(sessionId));
  const sdkSession = useStore((s) => s.sdkSessions.find((sdk) => sdk.sessionId === sessionId));
  const scope = useStore((s) => s.diffScope.get(sessionId) ?? "uncommitted") as DiffScope;

  const cwd = session?.cwd || sdkSession?.cwd;

  const { files, diffs, loading, error, refresh } = useDiffData(sessionId, scope, cwd);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [treeVisible, setTreeVisible] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 640 : true,
  );

  // Auto-select first file when files change
  useEffect(() => {
    if (files.length > 0 && (!selectedFile || !files.some((f) => f.fileName === selectedFile))) {
      setSelectedFile(files[0].fileName);
    }
  }, [files, selectedFile]);

  // Auto-expand first file
  useEffect(() => {
    if (files.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set([files[0].fileName]));
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectFile = useCallback((fileName: string) => {
    setSelectedFile(fileName);
    // Auto-expand on select
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      next.add(fileName);
      return next;
    });
    // Collapse tree on mobile
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setTreeVisible(false);
    }
  }, []);

  const handleToggleFile = useCallback((fileName: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  }, []);

  const handleToggleExpandAll = useCallback(() => {
    setAllExpanded((prev) => {
      const next = !prev;
      if (next) {
        setExpandedFiles(new Set(files.map((f) => f.fileName)));
      } else {
        setExpandedFiles(new Set());
      }
      return next;
    });
  }, [files]);

  // Escape key: collapse all
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpandedFiles(new Set());
        setAllExpanded(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Sync allExpanded state
  useEffect(() => {
    setAllExpanded(files.length > 0 && expandedFiles.size === files.length);
  }, [expandedFiles.size, files.length]);

  if (!cwd) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-cc-muted text-sm">Waiting for session to initialize...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cc-bg">
      <DiffScopeSelector
        sessionId={sessionId}
        allExpanded={allExpanded}
        onToggleExpandAll={handleToggleExpandAll}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-cc-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={refresh}
            className="text-xs text-cc-primary hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none px-6">
          <div className="w-14 h-14 rounded-2xl bg-cc-card border border-cc-border flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-cc-muted">
              <path d="M12 3v18M3 12h18" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm text-cc-fg font-medium mb-1">No changes yet</p>
            <p className="text-xs text-cc-muted leading-relaxed">
              {scope === "uncommitted" && "Uncommitted changes will appear here."}
              {scope === "branch" && "Branch changes vs main will appear here."}
              {scope === "last_turn" && "Files changed in the last turn will appear here."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 relative">
          {/* Mobile backdrop */}
          {treeVisible && (
            <div
              className="fixed inset-0 bg-black/30 z-20 sm:hidden"
              onClick={() => setTreeVisible(false)}
            />
          )}

          {/* File tree sidebar */}
          <div
            className={`
              ${treeVisible ? "w-[220px] translate-x-0" : "w-0 -translate-x-full"}
              fixed sm:relative z-30 sm:z-auto
              ${treeVisible ? "sm:w-[220px]" : "sm:w-0 sm:-translate-x-full"}
              shrink-0 h-full flex flex-col bg-cc-sidebar border-r border-cc-border transition-all duration-200 overflow-hidden
            `}
          >
            <div className="w-[220px] px-3 py-2 text-[11px] font-semibold text-cc-fg uppercase tracking-wider border-b border-cc-border shrink-0 flex items-center justify-between">
              <span>Files ({files.length})</span>
              <button
                onClick={() => setTreeVisible(false)}
                className="w-5 h-5 flex items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer sm:hidden"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <DiffFileTree
              files={files}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
            />
          </div>

          {/* Content area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!treeVisible && (
              <div className="shrink-0 flex items-center px-2 py-1.5 border-b border-cc-border sm:hidden">
                <button
                  onClick={() => setTreeVisible(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-cc-muted hover:text-cc-fg hover:bg-cc-hover rounded-md transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
                  </svg>
                  Files
                </button>
              </div>
            )}
            <DiffContentArea
              files={files}
              diffs={diffs}
              expandedFiles={expandedFiles}
              onToggleFile={handleToggleFile}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
            />
          </div>
        </div>
      )}
    </div>
  );
}
