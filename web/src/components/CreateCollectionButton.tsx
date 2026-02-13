import { useState, useRef, useEffect, useCallback } from "react";
import { useCollectionsStore } from "../collections/store.js";

export function CreateCollectionButton() {
  const addCollection = useCollectionsStore((s) => s.addCollection);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = useCallback(() => {
    if (name.trim()) {
      addCollection(name.trim());
    }
    setName("");
    setIsCreating(false);
  }, [name, addCollection]);

  const handleCancel = useCallback(() => {
    setName("");
    setIsCreating(false);
  }, []);

  if (isCreating) {
    return (
      <div className="px-2 py-1">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
          onBlur={handleCreate}
          placeholder="Collection name..."
          className="w-full text-[11px] px-2 py-1.5 rounded-md bg-cc-hover border border-cc-border text-cc-fg placeholder:text-cc-muted/50 outline-none focus:border-cc-primary/50"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsCreating(true)}
      className="w-full px-2 py-1.5 flex items-center gap-1.5 text-[11px] text-cc-muted/60 hover:text-cc-muted hover:bg-cc-hover rounded-md transition-colors cursor-pointer"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
        <path d="M8 3v10M3 8h10" strokeLinecap="round" />
      </svg>
      New Collection
    </button>
  );
}
