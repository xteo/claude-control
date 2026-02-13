import { useStore } from "../store.js";
import type { DiffScope } from "../hooks/useDiffData.js";

const scopes: { value: DiffScope; label: string }[] = [
  { value: "uncommitted", label: "Uncommitted" },
  { value: "branch", label: "Branch (vs main)" },
  { value: "last_turn", label: "Last Turn" },
];

interface Props {
  sessionId: string;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
}

export function DiffScopeSelector({ sessionId, allExpanded, onToggleExpandAll }: Props) {
  const scope = useStore((s) => s.diffScope.get(sessionId) ?? "uncommitted") as DiffScope;
  const setDiffScope = useStore((s) => s.setDiffScope);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-cc-border bg-cc-card shrink-0">
      <div className="flex items-center gap-1 rounded-lg bg-cc-bg p-0.5">
        {scopes.map((s) => (
          <button
            key={s.value}
            onClick={() => setDiffScope(sessionId, s.value)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
              scope === s.value
                ? "bg-cc-primary text-white shadow-sm"
                : "text-cc-muted hover:text-cc-fg hover:bg-cc-hover"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onToggleExpandAll}
        className="px-2 py-1 text-[11px] text-cc-muted hover:text-cc-fg hover:bg-cc-hover rounded-md transition-colors cursor-pointer"
      >
        {allExpanded ? "Collapse All" : "Expand All"}
      </button>
    </div>
  );
}
