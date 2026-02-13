import { useMemo } from "react";
import { useCollectionsStore } from "./store.js";
import { groupSessionsByProject, type SessionItem, type ProjectGroup } from "../utils/project-grouping.js";
import type { SessionCollection } from "./types.js";

export interface CollectionGroup {
  collection: SessionCollection;
  sessions: SessionItem[];
}

export interface SidebarGroups {
  collectionGroups: CollectionGroup[];
  ungroupedProjectGroups: ProjectGroup[];
}

export function useSidebarGroups(activeSessions: SessionItem[]): SidebarGroups {
  const collections = useCollectionsStore((s) => s.collections);
  const sessionAssignments = useCollectionsStore((s) => s.sessionAssignments);

  return useMemo(() => {
    // Partition sessions into assigned and unassigned
    const assignedSessionIds = new Set<string>();
    const collectionSessionMap = new Map<string, SessionItem[]>();

    for (const session of activeSessions) {
      const collectionId = sessionAssignments[session.id];
      if (collectionId && collections.some((c) => c.id === collectionId)) {
        assignedSessionIds.add(session.id);
        const list = collectionSessionMap.get(collectionId) || [];
        list.push(session);
        collectionSessionMap.set(collectionId, list);
      }
    }

    // Build collection groups, sorted by sortOrder
    const sortedCollections = [...collections].sort((a, b) => a.sortOrder - b.sortOrder);
    const collectionGroups: CollectionGroup[] = sortedCollections.map((collection) => ({
      collection,
      sessions: collectionSessionMap.get(collection.id) || [],
    }));

    // Unassigned sessions fall through to project grouping
    const unassigned = activeSessions.filter((s) => !assignedSessionIds.has(s.id));
    const ungroupedProjectGroups = groupSessionsByProject(unassigned);

    return { collectionGroups, ungroupedProjectGroups };
  }, [activeSessions, collections, sessionAssignments]);
}
