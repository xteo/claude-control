import { useState, useMemo, useCallback } from "react";
import type { DiffFileInfo } from "../lib/diff-stats.js";

interface DirNode {
  name: string;
  path: string;
  children: Map<string, DirNode>;
  files: DiffFileInfo[];
}

interface Props {
  files: DiffFileInfo[];
  selectedFile: string | null;
  onSelectFile: (fileName: string) => void;
}

function buildTree(files: DiffFileInfo[]): DirNode {
  const root: DirNode = { name: "", path: "", children: new Map(), files: [] };

  for (const file of files) {
    const parts = file.fileName.split("/");
    const fileName = parts.pop()!;
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
          files: [],
        });
      }
      node = node.children.get(part)!;
    }

    node.files.push({ ...file, fileName });
  }

  return root;
}

function statusColor(status: DiffFileInfo["status"]): string {
  if (status === "added") return "text-cc-success";
  if (status === "deleted") return "text-cc-error";
  return "text-cc-warning";
}

function statusBg(status: DiffFileInfo["status"]): string {
  if (status === "added") return "bg-cc-success";
  if (status === "deleted") return "bg-cc-error";
  return "bg-cc-warning";
}

function StatsLabel({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="text-[10px] font-mono-code ml-auto shrink-0 opacity-70">
      {additions > 0 && <span className="text-cc-success">+{additions}</span>}
      {additions > 0 && deletions > 0 && <span className="text-cc-muted">/</span>}
      {deletions > 0 && <span className="text-cc-error">-{deletions}</span>}
    </span>
  );
}

function DirEntry({
  node,
  selectedFile,
  onSelectFile,
  depth,
}: {
  node: DirNode;
  selectedFile: string | null;
  onSelectFile: (fileName: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const sortedDirs = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children],
  );

  const sortedFiles = useMemo(
    () => [...node.files].sort((a, b) => a.fileName.localeCompare(b.fileName)),
    [node.files],
  );

  return (
    <div>
      {/* Directory header */}
      {node.name && (
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-[12px] text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-cc-muted">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
          </svg>
          <span className="truncate font-medium">{node.name}/</span>
        </button>
      )}

      {!collapsed && (
        <>
          {sortedDirs.map((dir) => (
            <DirEntry
              key={dir.path}
              node={dir}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              depth={node.name ? depth + 1 : depth}
            />
          ))}
          {sortedFiles.map((file) => {
            const fullPath = node.path ? `${node.path}/${file.fileName}` : file.fileName;
            return (
              <button
                key={fullPath}
                onClick={() => onSelectFile(fullPath)}
                className={`flex items-center gap-1.5 w-full px-2 py-1 text-[12px] transition-colors cursor-pointer ${
                  selectedFile === fullPath
                    ? "bg-cc-active text-cc-fg"
                    : "text-cc-fg/70 hover:bg-cc-hover hover:text-cc-fg"
                }`}
                style={{ paddingLeft: `${(node.name ? depth + 1 : depth) * 12 + 8}px` }}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusBg(file.status)}`} />
                <span className="truncate">{file.fileName}</span>
                <StatsLabel additions={file.additions} deletions={file.deletions} />
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

export function DiffFileTree({ files, selectedFile, onSelectFile }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);

  const handleSelect = useCallback(
    (fileName: string) => {
      onSelectFile(fileName);
    },
    [onSelectFile],
  );

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-cc-muted text-[11px] text-center">No files changed</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden py-1">
      <DirEntry
        node={tree}
        selectedFile={selectedFile}
        onSelectFile={handleSelect}
        depth={0}
      />
    </div>
  );
}
