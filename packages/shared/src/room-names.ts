/**
 * Collaboration room-name grammar shared by the web client (which builds names) and the collab
 * server (which parses them). Single source of truth for the two room shapes:
 *   - presence room:  `presence/<projectId>`
 *   - content room:   `<projectId>/<yjsStateId>`
 * Keeping the prefix and the build/parse helpers together means the convention lives in exactly one
 * place and the two sides cannot drift.
 */

/**
 * Prefix marking a project-wide presence room, distinct from a `<projectId>/<yjsStateId>` document
 * room. Do not redefine elsewhere.
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
 * Parses a content-document room name (`<projectId>/<yjsStateId>`) into its two id strings, or returns
 * null when the name is not a well-formed content room. Single authority for the content-room grammar,
 * shared by the collab server (which layers typed value objects on top) and the change notifier — so
 * the split-on-first-`/` convention lives in exactly one place.
 *
 * @param roomName - The Hocuspocus room name to parse.
 * @returns The `{ projectId, yjsStateId }` id strings, or null when malformed.
 */
export function parseContentRoom(roomName: string): { projectId: string; yjsStateId: string } | null {
  const slash = roomName.indexOf('/');
  if (slash === -1) return null;
  const projectId = roomName.slice(0, slash);
  const yjsStateId = roomName.slice(slash + 1);
  if (!projectId || !yjsStateId) return null;
  return { projectId, yjsStateId };
}
