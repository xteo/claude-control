import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { useCollectionsStore } from "../collections/store.js";
import { hasDraggedSession, getSessionDragData, setCollectionDragData } from "../collections/drag-reorder.js";
import { SessionItem } from "./SessionItem.js";
import type { SessionCollection } from "../collections/types.js";
import type { SessionItem as SessionItemType } from "../utils/project-grouping.js";

interface CollectionGroupProps {
  collection: SessionCollection;
  sessions: SessionItemType[];
  isCollapsed: boolean;
  currentSessionId: string | null;
  sessionNames: Map<string, string>;
  pendingPermissions: Map<string, Map<string, unknown>>;
  recentlyRenamed: Set<string>;
  onSelect: (id: string) => void;
  onStartRename: (id: string, currentName: string) => void;
  onArchive: (e: React.MouseEvent, id: string) => void;
  onUnarchive: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  editingSessionId: string | null;
  editingName: string;
  setEditingName: (name: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  editInputRef: RefObject<HTMLInputElement | null>;
}

export function CollectionGroup({
  collection,
  sessions,
  isCollapsed,
  currentSessionId,
  sessionNames,
  pendingPermissions,
  recentlyRenamed,
  onSelect,
  onStartRename,
  onArchive,
  onUnarchive,
  onDelete,
  editingSessionId,
  editingName,
  setEditingName,
  onConfirmRename,
  onCancelRename,
  editInputRef,
}: CollectionGroupProps) {
  const toggleCollapse = useCollectionsStore((s) => s.toggleCollectionCollapse);
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const removeCollection = useCollectionsStore((s) => s.removeCollection);
  const assignSession = useCollectionsStore((s) => s.assignSession);

  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [editValue, setEditValue] = useState(collection.name);
  const [isDragOver, setDragOver] = useState(false);
  const collectionEditRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingCollection && collectionEditRef.current) {
      collectionEditRef.current.focus();
      collectionEditRef.current.select();
    }
  }, [isEditingCollection]);

  const handleConfirmCollectionRename = useCallback(() => {
    if (editValue.trim()) {
      renameCollection(collection.id, editValue.trim());
    }
    setIsEditingCollection(false);
  }, [editValue, collection.id, renameCollection]);

  const handleCancelCollectionRename = useCallback(() => {
    setEditValue(collection.name);
    setIsEditingCollection(false);
  }, [collection.name]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeCollection(collection.id);
  }, [collection.id, removeCollection]);

  // Drag & drop handlers for receiving sessions
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (hasDraggedSession(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const sessionId = getSessionDragData(e);
    if (sessionId) {
      assignSession(sessionId, collection.id);
    }
  }, [assignSession, collection.id]);

  // Collection drag (for reordering)
  const handleCollectionDragStart = useCallback((e: React.DragEvent) => {
    setCollectionDragData(e, collection.id);
  }, [collection.id]);

  return (
    <div
      className={`mt-1 pt-1 border-t border-cc-border/50 ${isDragOver ? "bg-cc-primary/5 rounded-lg" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Collection header */}
      <div className="group/collection relative">
        <button
          draggable
          onDragStart={handleCollectionDragStart}
          onClick={() => toggleCollapse(collection.id)}
          onDoubleClick={(e) => {
            e.preventDefault();
            setEditValue(collection.name);
            setIsEditingCollection(true);
          }}
          className={`w-full px-2 py-1.5 flex items-center gap-1.5 hover:bg-cc-hover rounded-md transition-colors cursor-pointer ${
            isDragOver ? "ring-1 ring-cc-primary/40" : ""
          }`}
        >
          {/* Collapse chevron */}
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3 h-3 text-cc-muted transition-transform ${isCollapsed ? "" : "rotate-90"}`}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>

          {/* Collection icon */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-cc-primary/70 shrink-0">
            <path d="M1.5 2A1.5 1.5 0 000 3.5v2h16v-2A1.5 1.5 0 0014.5 2h-6l-1-1h-6zM16 6.5H0v6A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7z" />
          </svg>

          {/* Name or inline edit */}
          {isEditingCollection ? (
            <input
              ref={collectionEditRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirmCollectionRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelCollectionRename();
                }
                e.stopPropagation();
              }}
              onBlur={handleConfirmCollectionRename}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="text-[11px] font-semibold flex-1 min-w-0 text-cc-fg bg-transparent border border-cc-border rounded px-1 py-0 outline-none focus:border-cc-primary/50"
            />
          ) : (
            <span className="text-[11px] font-semibold text-cc-fg/80 truncate">
              {collection.name}
            </span>
          )}

          {/* Session count */}
          <span className="text-[10px] text-cc-muted/60 shrink-0 ml-auto">
            {sessions.length}
          </span>
        </button>

        {/* Delete button on hover */}
        {!isEditingCollection && (
          <button
            onClick={handleDelete}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover/collection:opacity-100 hover:bg-cc-border text-cc-muted hover:text-red-400 transition-all cursor-pointer"
            title="Delete collection"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Session list */}
      {!isCollapsed && (
        <div className="space-y-0.5 mt-0.5">
          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-cc-muted/50 italic">
              Drop sessions here
            </p>
          ) : (
            sessions.map((s) => {
              const permCount = pendingPermissions.get(s.id)?.size ?? 0;
              return (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={currentSessionId === s.id}
                  sessionName={sessionNames.get(s.id)}
                  permCount={permCount}
                  isRecentlyRenamed={recentlyRenamed.has(s.id)}
                  onSelect={onSelect}
                  onStartRename={onStartRename}
                  onArchive={onArchive}
                  onUnarchive={onUnarchive}
                  onDelete={onDelete}
                  editingSessionId={editingSessionId}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  onConfirmRename={onConfirmRename}
                  onCancelRename={onCancelRename}
                  editInputRef={editInputRef}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
