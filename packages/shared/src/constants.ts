/** Default port the apps/api internal collaboration server binds to. */
export const COLLAB_INTERNAL_PORT_DEFAULT = 4001;

/**
 * Prefix marking a project-wide presence room, distinct from a `<projectId>/<yjsStateId>` document
 * room. Single source of truth for the room-name convention shared by the web client (builds the
 * name) and the collab server (parses it). Do not redefine elsewhere.
 */
export const PRESENCE_ROOM_PREFIX = 'presence/';

/** Builds the canonical project presence-room name (`presence/<projectId>`). */
export function presenceRoomName(projectId: string): string {
  return `${PRESENCE_ROOM_PREFIX}${projectId}`;
}

/** True when a room name is a project presence room rather than a `<projectId>/<yjsStateId>` document room. */
export function isPresenceRoom(roomName: string): boolean {
  return roomName.startsWith(PRESENCE_ROOM_PREFIX);
}

/**
 * Paths of the internal collaboration auth endpoints (apps/api internal server). Shared so the
 * collab auth-hook URL builder and the API route registration reference one source and cannot drift.
 */
export const COLLAB_AUTH_DOCUMENT_PATH = '/internal/collab/auth/document';
export const COLLAB_AUTH_PRESENCE_PATH = '/internal/collab/auth/presence';

/**
 * Path of the internal content-changed notify endpoint (apps/api internal server). The collab server
 * POSTs here on a debounced live edit so the API can broadcast a content-changed event to the
 * project's SSE subscribers. Shared so the collab notifier and the API route reference one source.
 */
export const COLLAB_CONTENT_CHANGED_PATH = '/internal/collab/content-changed';
