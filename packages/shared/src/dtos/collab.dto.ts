/** Role assigned to a WebSocket connection by the collaboration auth endpoint. */
export type CollabAuthRole = 'editor' | 'observer';

/** Response body returned by GET /internal/collab/auth. */
export interface CollabAuthResponse {
  /** The role assigned to the connecting user for this document. */
  role: CollabAuthRole;
}
