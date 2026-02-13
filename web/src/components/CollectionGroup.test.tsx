// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { SessionItem } from "../utils/project-grouping.js";

// ─── Mock collections store ─────────────────────────────────────────────────

const mockCollectionsStore = {
  toggleCollectionCollapse: vi.fn(),
  renameCollection: vi.fn(),
  removeCollection: vi.fn(),
  assignSession: vi.fn(),
};

vi.mock("../collections/store.js", () => {
  const useStoreFn = (selector: (state: typeof mockCollectionsStore) => unknown) => {
    return selector(mockCollectionsStore);
  };
  useStoreFn.getState = () => mockCollectionsStore;
  return { useCollectionsStore: useStoreFn };
});

// ─── Mock main store ────────────────────────────────────────────────────────

const mockMainStore = {
  clearRecentlyRenamed: vi.fn(),
};

vi.mock("../store.js", () => {
  const useStoreFn = (selector: (state: typeof mockMainStore) => unknown) => {
    return selector(mockMainStore);
  };
  useStoreFn.getState = () => mockMainStore;
  return { useStore: useStoreFn };
});

// ─── Import after mocks ─────────────────────────────────────────────────────

import { CollectionGroup } from "./CollectionGroup.js";

function makeSession(id: string, overrides: Partial<SessionItem> = {}): SessionItem {
  return {
    id,
    model: "claude-sonnet-4-5-20250929",
    cwd: "/test",
    gitBranch: "",
    isWorktree: false,
    gitAhead: 0,
    gitBehind: 0,
    linesAdded: 0,
    linesRemoved: 0,
    isConnected: false,
    status: null,
    sdkState: null,
    createdAt: Date.now(),
    archived: false,
    backendType: "claude",
    repoRoot: "",
    permCount: 0,
    dangerouslySkipPermissions: false,
    sandboxMode: "off" as const,
    ...overrides,
  };
}

const baseProps = {
  currentSessionId: null,
  sessionNames: new Map<string, string>(),
  pendingPermissions: new Map<string, Map<string, unknown>>(),
  recentlyRenamed: new Set<string>(),
  onSelect: vi.fn(),
  onStartRename: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onDelete: vi.fn(),
  editingSessionId: null,
  editingName: "",
  setEditingName: vi.fn(),
  onConfirmRename: vi.fn(),
  onCancelRename: vi.fn(),
  editInputRef: { current: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CollectionGroup", () => {
  it("renders collection name and session count", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Auth Feature", sortOrder: 0, createdAt: 0 }}
        sessions={[makeSession("s1"), makeSession("s2")]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    expect(screen.getByText("Auth Feature")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders sessions when not collapsed", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Group", sortOrder: 0, createdAt: 0 }}
        sessions={[makeSession("s1", { model: "visible-model" })]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    expect(screen.getByText("visible-model")).toBeInTheDocument();
  });

  it("hides sessions when collapsed", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Group", sortOrder: 0, createdAt: 0 }}
        sessions={[makeSession("s1", { model: "hidden-model" })]}
        isCollapsed={true}
        {...baseProps}
      />,
    );

    expect(screen.queryByText("hidden-model")).not.toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Empty", sortOrder: 0, createdAt: 0 }}
        sessions={[]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    expect(screen.getByText("Drop sessions here")).toBeInTheDocument();
  });

  it("clicking header toggles collapse", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Toggleable", sortOrder: 0, createdAt: 0 }}
        sessions={[]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    fireEvent.click(screen.getByText("Toggleable"));
    expect(mockCollectionsStore.toggleCollectionCollapse).toHaveBeenCalledWith("c1");
  });

  it("delete button calls removeCollection", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "ToDelete", sortOrder: 0, createdAt: 0 }}
        sessions={[]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    const deleteBtn = screen.getByTitle("Delete collection");
    fireEvent.click(deleteBtn);
    expect(mockCollectionsStore.removeCollection).toHaveBeenCalledWith("c1");
  });

  it("double-click enters inline rename mode", () => {
    render(
      <CollectionGroup
        collection={{ id: "c1", name: "Renameable", sortOrder: 0, createdAt: 0 }}
        sessions={[]}
        isCollapsed={false}
        {...baseProps}
      />,
    );

    const headerBtn = screen.getByText("Renameable").closest("button")!;
    fireEvent.doubleClick(headerBtn);

    const input = screen.getByDisplayValue("Renameable");
    expect(input).toBeInTheDocument();
  });
});
