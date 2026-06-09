/** Role assigned to a WebSocket connection by the collaboration auth endpoint. */
export type CollabAuthRole = 'editor' | 'observer';

/** Response body returned by GET /internal/collab/auth. */
export interface CollabAuthResponse {
  /** The role assigned to the connecting user for this document. */
  role: CollabAuthRole;
  /** The authenticated user's id — used by the collab server for per-user connection limits and audit. */
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
  /** Collaboration role of the requesting user for this document. */
  role: CollabAuthRole;
}
