// @vitest-environment jsdom

import { useCollectionsStore } from "./store.js";

beforeEach(() => {
  localStorage.clear();
  // Reset the store to initial empty state
  useCollectionsStore.setState({
    collections: [],
    sessionAssignments: {},
    collapsedCollections: new Set(),
  });
});

describe("Collections store", () => {
  // ─── addCollection ──────────────────────────────────────────────────────────

  describe("addCollection", () => {
    it("creates a collection with a UUID, name, and sortOrder", () => {
      useCollectionsStore.getState().addCollection("Auth Feature");

      const { collections } = useCollectionsStore.getState();
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe("Auth Feature");
      expect(collections[0].sortOrder).toBe(0);
      expect(collections[0].id).toBeTruthy();
      expect(collections[0].createdAt).toBeGreaterThan(0);
    });

    it("increments sortOrder for subsequent collections", () => {
      useCollectionsStore.getState().addCollection("First");
      useCollectionsStore.getState().addCollection("Second");
      useCollectionsStore.getState().addCollection("Third");

      const { collections } = useCollectionsStore.getState();
      expect(collections).toHaveLength(3);
      expect(collections[0].sortOrder).toBe(0);
      expect(collections[1].sortOrder).toBe(1);
      expect(collections[2].sortOrder).toBe(2);
    });

    it("persists to localStorage", () => {
      useCollectionsStore.getState().addCollection("Persisted");

      const stored = JSON.parse(localStorage.getItem("cc-collections")!);
      expect(stored.collections).toHaveLength(1);
      expect(stored.collections[0].name).toBe("Persisted");
    });
  });

  // ─── removeCollection ───────────────────────────────────────────────────────

  describe("removeCollection", () => {
    it("removes the collection by id", () => {
      useCollectionsStore.getState().addCollection("ToRemove");
      useCollectionsStore.getState().addCollection("ToKeep");

      const { collections } = useCollectionsStore.getState();
      const removeId = collections.find((c) => c.name === "ToRemove")!.id;

      useCollectionsStore.getState().removeCollection(removeId);

      const after = useCollectionsStore.getState().collections;
      expect(after).toHaveLength(1);
      expect(after[0].name).toBe("ToKeep");
    });

    it("clears all session assignments for the removed collection", () => {
      useCollectionsStore.getState().addCollection("Group");
      const collectionId = useCollectionsStore.getState().collections[0].id;

      useCollectionsStore.getState().assignSession("s1", collectionId);
      useCollectionsStore.getState().assignSession("s2", collectionId);

      useCollectionsStore.getState().removeCollection(collectionId);

      const { sessionAssignments } = useCollectionsStore.getState();
      expect(sessionAssignments).toEqual({});
    });

    it("does not affect assignments to other collections", () => {
      useCollectionsStore.getState().addCollection("A");
      useCollectionsStore.getState().addCollection("B");
      const [colA, colB] = useCollectionsStore.getState().collections;

      useCollectionsStore.getState().assignSession("s1", colA.id);
      useCollectionsStore.getState().assignSession("s2", colB.id);

      useCollectionsStore.getState().removeCollection(colA.id);

      const { sessionAssignments } = useCollectionsStore.getState();
      expect(sessionAssignments["s1"]).toBeUndefined();
      expect(sessionAssignments["s2"]).toBe(colB.id);
    });

    it("persists removal to localStorage", () => {
      useCollectionsStore.getState().addCollection("Gone");
      const id = useCollectionsStore.getState().collections[0].id;
      useCollectionsStore.getState().removeCollection(id);

      const stored = JSON.parse(localStorage.getItem("cc-collections")!);
      expect(stored.collections).toHaveLength(0);
    });
  });

  // ─── renameCollection ───────────────────────────────────────────────────────

  describe("renameCollection", () => {
    it("updates the name of an existing collection", () => {
      useCollectionsStore.getState().addCollection("OldName");
      const id = useCollectionsStore.getState().collections[0].id;

      useCollectionsStore.getState().renameCollection(id, "NewName");

      expect(useCollectionsStore.getState().collections[0].name).toBe("NewName");
    });

    it("persists rename to localStorage", () => {
      useCollectionsStore.getState().addCollection("Before");
      const id = useCollectionsStore.getState().collections[0].id;
      useCollectionsStore.getState().renameCollection(id, "After");

      const stored = JSON.parse(localStorage.getItem("cc-collections")!);
      expect(stored.collections[0].name).toBe("After");
    });
  });

  // ─── reorderCollections ─────────────────────────────────────────────────────

  describe("reorderCollections", () => {
    it("updates sortOrder based on array position", () => {
      useCollectionsStore.getState().addCollection("A");
      useCollectionsStore.getState().addCollection("B");
      useCollectionsStore.getState().addCollection("C");

      const collections = useCollectionsStore.getState().collections;
      const ids = collections.map((c) => c.id);

      // Reverse the order
      useCollectionsStore.getState().reorderCollections([ids[2], ids[0], ids[1]]);

      const reordered = useCollectionsStore.getState().collections;
      const byId = (id: string) => reordered.find((c) => c.id === id)!;
      expect(byId(ids[2]).sortOrder).toBe(0);
      expect(byId(ids[0]).sortOrder).toBe(1);
      expect(byId(ids[1]).sortOrder).toBe(2);
    });
  });

  // ─── assignSession / unassignSession ────────────────────────────────────────

  describe("session assignments", () => {
    it("assignSession maps a session to a collection", () => {
      useCollectionsStore.getState().addCollection("Group");
      const collectionId = useCollectionsStore.getState().collections[0].id;

      useCollectionsStore.getState().assignSession("s1", collectionId);

      expect(useCollectionsStore.getState().sessionAssignments["s1"]).toBe(collectionId);
    });

    it("assignSession ignores non-existent collection", () => {
      useCollectionsStore.getState().assignSession("s1", "non-existent-id");

      expect(useCollectionsStore.getState().sessionAssignments["s1"]).toBeUndefined();
    });

    it("assignSession overwrites previous assignment", () => {
      useCollectionsStore.getState().addCollection("A");
      useCollectionsStore.getState().addCollection("B");
      const [colA, colB] = useCollectionsStore.getState().collections;

      useCollectionsStore.getState().assignSession("s1", colA.id);
      useCollectionsStore.getState().assignSession("s1", colB.id);

      expect(useCollectionsStore.getState().sessionAssignments["s1"]).toBe(colB.id);
    });

    it("unassignSession removes the session mapping", () => {
      useCollectionsStore.getState().addCollection("Group");
      const collectionId = useCollectionsStore.getState().collections[0].id;

      useCollectionsStore.getState().assignSession("s1", collectionId);
      useCollectionsStore.getState().unassignSession("s1");

      expect(useCollectionsStore.getState().sessionAssignments["s1"]).toBeUndefined();
    });

    it("unassignSession is a no-op for unassigned sessions", () => {
      useCollectionsStore.getState().unassignSession("s99");
      expect(useCollectionsStore.getState().sessionAssignments).toEqual({});
    });

    it("assignments persist to localStorage", () => {
      useCollectionsStore.getState().addCollection("Group");
      const collectionId = useCollectionsStore.getState().collections[0].id;
      useCollectionsStore.getState().assignSession("s1", collectionId);

      const stored = JSON.parse(localStorage.getItem("cc-collections")!);
      expect(stored.sessionAssignments["s1"]).toBe(collectionId);
    });
  });

  // ─── toggleCollectionCollapse ───────────────────────────────────────────────

  describe("toggleCollectionCollapse", () => {
    it("toggles collapse state for a collection", () => {
      useCollectionsStore.getState().toggleCollectionCollapse("col-1");
      expect(useCollectionsStore.getState().collapsedCollections.has("col-1")).toBe(true);

      useCollectionsStore.getState().toggleCollectionCollapse("col-1");
      expect(useCollectionsStore.getState().collapsedCollections.has("col-1")).toBe(false);
    });

    it("persists collapsed state to localStorage", () => {
      useCollectionsStore.getState().toggleCollectionCollapse("col-1");

      const stored = JSON.parse(localStorage.getItem("cc-collections")!);
      expect(stored.collapsedCollections).toContain("col-1");
    });
  });
});
