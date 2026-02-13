export const MIME_SESSION_ID = "application/x-session-id";
export const MIME_COLLECTION_ID = "application/x-collection-id";

export function setSessionDragData(e: React.DragEvent, sessionId: string) {
  e.dataTransfer.setData(MIME_SESSION_ID, sessionId);
  e.dataTransfer.effectAllowed = "move";
}

export function getSessionDragData(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(MIME_SESSION_ID) || null;
}

export function setCollectionDragData(e: React.DragEvent, collectionId: string) {
  e.dataTransfer.setData(MIME_COLLECTION_ID, collectionId);
  e.dataTransfer.effectAllowed = "move";
}

export function getCollectionDragData(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(MIME_COLLECTION_ID) || null;
}

/** Returns true if the drag event contains a session being dragged */
export function hasDraggedSession(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME_SESSION_ID);
}
