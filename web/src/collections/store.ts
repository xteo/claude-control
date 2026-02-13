import { create } from "zustand";
import type { CollectionsState, SessionCollection } from "./types.js";

const STORAGE_KEY = "cc-collections";

interface PersistedData {
  collections: SessionCollection[];
  sessionAssignments: Record<string, string>;
  collapsedCollections: string[];
}

function loadFromStorage(): {
  collections: SessionCollection[];
  sessionAssignments: Record<string, string>;
  collapsedCollections: Set<string>;
} {
  if (typeof window === "undefined") {
    return { collections: [], sessionAssignments: {}, collapsedCollections: new Set() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { collections: [], sessionAssignments: {}, collapsedCollections: new Set() };
    const data: PersistedData = JSON.parse(raw);
    return {
      collections: data.collections || [],
      sessionAssignments: data.sessionAssignments || {},
      collapsedCollections: new Set(data.collapsedCollections || []),
    };
  } catch {
    return { collections: [], sessionAssignments: {}, collapsedCollections: new Set() };
  }
}

function saveToStorage(state: { collections: SessionCollection[]; sessionAssignments: Record<string, string>; collapsedCollections: Set<string> }) {
  if (typeof window === "undefined") return;
  const data: PersistedData = {
    collections: state.collections,
    sessionAssignments: state.sessionAssignments,
    collapsedCollections: Array.from(state.collapsedCollections),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const initial = loadFromStorage();

export const useCollectionsStore = create<CollectionsState>((set) => ({
  collections: initial.collections,
  sessionAssignments: initial.sessionAssignments,
  collapsedCollections: initial.collapsedCollections,

  addCollection: (name) =>
    set((s) => {
      const maxOrder = s.collections.reduce((max, c) => Math.max(max, c.sortOrder), -1);
      const newCollection: SessionCollection = {
        id: crypto.randomUUID(),
        name,
        sortOrder: maxOrder + 1,
        createdAt: Date.now(),
      };
      const next = {
        ...s,
        collections: [...s.collections, newCollection],
      };
      saveToStorage(next);
      return { collections: next.collections };
    }),

  removeCollection: (id) =>
    set((s) => {
      const collections = s.collections.filter((c) => c.id !== id);
      const sessionAssignments = { ...s.sessionAssignments };
      for (const [sessionId, collectionId] of Object.entries(sessionAssignments)) {
        if (collectionId === id) {
          delete sessionAssignments[sessionId];
        }
      }
      const next = { ...s, collections, sessionAssignments };
      saveToStorage(next);
      return { collections, sessionAssignments };
    }),

  renameCollection: (id, name) =>
    set((s) => {
      const collections = s.collections.map((c) =>
        c.id === id ? { ...c, name } : c,
      );
      const next = { ...s, collections };
      saveToStorage(next);
      return { collections };
    }),

  reorderCollections: (orderedIds) =>
    set((s) => {
      const collections = s.collections.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, sortOrder: idx } : c;
      });
      const next = { ...s, collections };
      saveToStorage(next);
      return { collections };
    }),

  assignSession: (sessionId, collectionId) =>
    set((s) => {
      // Only assign if the collection exists
      if (!s.collections.some((c) => c.id === collectionId)) return s;
      const sessionAssignments = { ...s.sessionAssignments, [sessionId]: collectionId };
      const next = { ...s, sessionAssignments };
      saveToStorage(next);
      return { sessionAssignments };
    }),

  unassignSession: (sessionId) =>
    set((s) => {
      const sessionAssignments = { ...s.sessionAssignments };
      delete sessionAssignments[sessionId];
      const next = { ...s, sessionAssignments };
      saveToStorage(next);
      return { sessionAssignments };
    }),

  toggleCollectionCollapse: (collectionId) =>
    set((s) => {
      const collapsedCollections = new Set(s.collapsedCollections);
      if (collapsedCollections.has(collectionId)) {
        collapsedCollections.delete(collectionId);
      } else {
        collapsedCollections.add(collectionId);
      }
      const next = { ...s, collapsedCollections };
      saveToStorage(next);
      return { collapsedCollections };
    }),
}));
