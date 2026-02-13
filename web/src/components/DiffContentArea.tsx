import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { DiffViewer } from "./DiffViewer.js";
import type { DiffFileInfo } from "../lib/diff-stats.js";

interface Props {
  files: DiffFileInfo[];
  diffs: Map<string, string>;
  expandedFiles: Set<string>;
  onToggleFile: (fileName: string) => void;
  selectedFile: string | null;
  onSelectFile: (fileName: string) => void;
}

function statusBadge(status: DiffFileInfo["status"]): string {
  if (status === "added") return "bg-green-400/15 text-green-400";
  if (status === "deleted") return "bg-red-400/15 text-red-400";
  return "bg-yellow-400/15 text-yellow-400";
}

function statusLabel(status: DiffFileInfo["status"]): string {
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  return "M";
}

export function DiffContentArea({
  files,
  diffs,
  expandedFiles,
  onToggleFile,
  selectedFile,
  onSelectFile,
}: Props) {
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  // Scroll to file when selected from tree
  useEffect(() => {
    if (!selectedFile) return;
    const el = fileRefs.current.get(selectedFile);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedFile]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (files.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => {
          const next = Math.min(i + 1, files.length - 1);
          onSelectFile(files[next].fileName);
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => {
          const next = Math.max(i - 1, 0);
          onSelectFile(files[next].fileName);
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < files.length) {
          onToggleFile(files[focusIndex].fileName);
        }
      } else if (e.key === "Escape") {
        // Handled by parent to collapse all
      }
    }

    const container = containerRef.current;
    if (container) {
      container.addEventListener("keydown", handleKey);
      return () => container.removeEventListener("keydown", handleKey);
    }
  }, [files, focusIndex, onToggleFile, onSelectFile]);

  // Sync focusIndex when selectedFile changes externally
  useEffect(() => {
    if (!selectedFile) return;
    const idx = files.findIndex((f) => f.fileName === selectedFile);
    if (idx >= 0) setFocusIndex(idx);
  }, [selectedFile, files]);

  const setFileRef = useCallback((fileName: string, el: HTMLDivElement | null) => {
    if (el) {
      fileRefs.current.set(fileName, el);
    } else {
      fileRefs.current.delete(fileName);
    }
  }, []);

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-cc-muted text-sm">No changes to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto focus:outline-none"
      tabIndex={0}
    >
      {files.map((file) => {
        const isExpanded = expandedFiles.has(file.fileName);
        const isFocused = file.fileName === selectedFile;
        const diff = diffs.get(file.fileName) ?? "";

        return (
          <div
            key={file.fileName}
            ref={(el) => setFileRef(file.fileName, el)}
            className={`border-b border-cc-border ${isFocused ? "ring-1 ring-cc-primary/30 ring-inset" : ""}`}
          >
            {/* Accordion header */}
            <button
              onClick={() => {
                onToggleFile(file.fileName);
                onSelectFile(file.fileName);
              }}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-cc-hover transition-colors cursor-pointer"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`w-3 h-3 shrink-0 text-cc-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
              >
                <path d="M6 4l4 4-4 4" />
              </svg>

              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${statusBadge(file.status)}`}>
                {statusLabel(file.status)}
              </span>

              <span className="text-[13px] text-cc-fg font-medium truncate font-mono-code">
                {file.fileName}
              </span>

              <span className="ml-auto text-[11px] font-mono-code shrink-0">
                {file.additions > 0 && (
                  <span className="text-green-400">+{file.additions}</span>
                )}
                {file.additions > 0 && file.deletions > 0 && (
                  <span className="text-cc-muted mx-0.5">/</span>
                )}
                {file.deletions > 0 && (
                  <span className="text-red-400">-{file.deletions}</span>
                )}
              </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4">
                {diff ? (
                  <DiffViewer unifiedDiff={diff} fileName={file.fileName} mode="full" />
                ) : (
                  <div className="py-3 text-center text-cc-muted text-xs">
                    No diff content available
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
