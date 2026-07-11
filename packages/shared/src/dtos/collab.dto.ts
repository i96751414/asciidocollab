/** Role assigned to a WebSocket connection by the collaboration auth endpoint. */
export type CollabAuthRole = 'editor' | 'observer';

/** Response body returned by GET /internal/collab/auth/document (a document room connection). */
export interface CollabDocumentAuthResponse {
  /** The role assigned to the connecting user for this document. */
  role: CollabAuthRole;
  /** The authenticated user's id — used by the collab server for per-user connection limits and audit. */
  userId: string;
}

/**
 * Response body returned by GET /internal/collab/auth/presence (a project presence-room connection).
 * Presence is read-only awareness, so there is no collaboration role — only the authenticated user.
 */
export interface CollabPresenceAuthResponse {
  /** The authenticated user's id — used by the collab server for awareness identity and audit. */
  userId: string;
}

/**
 * Response of GET /projects/:projectId/files/:fileNodeId/collab.
 *
 * Gives the web editor the room identifier and the requesting user's
 * collaboration role so it can connect to the correct room and gate edits.
 */
export interface CollabDocumentInfo {
  /**
   * Yjs state id; combined with projectId to form the room name
   * `${projectId}/${yjsStateId}`.
   */
  yjsStateId: string;
  /** The backing Document's id, used as the key for document-scoped APIs such as review items. */
  documentId: string;
  /** Collaboration role of the requesting user for this document. */
  role: CollabAuthRole;
}
