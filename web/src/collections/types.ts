export interface SessionCollection {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
}

export interface CollectionsState {
  collections: SessionCollection[];
  /** Maps sessionId → collectionId */
  sessionAssignments: Record<string, string>;

  // Collapse state for collections (separate from project collapse in main store)
  collapsedCollections: Set<string>;

  // CRUD actions
  addCollection: (name: string) => void;
  removeCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  reorderCollections: (orderedIds: string[]) => void;
  assignSession: (sessionId: string, collectionId: string) => void;
  unassignSession: (sessionId: string) => void;
  toggleCollectionCollapse: (collectionId: string) => void;
}
