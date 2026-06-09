/** Collaboration role of a user for a document. `viewer` members map to `observer`. */
export type CollabRole = 'editor' | 'observer';

/**
 * Maps a project-membership role to a collaboration role: a `viewer` may only observe; every
 * other member role may edit. This is the single source of the role-mapping rule shared by the
 * REST collab-info path and the WebSocket collab-auth path — keeping it in one place prevents the
 * two gates from disagreeing on a user's role.
 *
 * @param memberRoleValue - The project membership role value (e.g. `editor`, `viewer`, `owner`).
 * @returns The collaboration role the member holds for the document.
 */
export function toCollabRole(memberRoleValue: string): CollabRole {
  return memberRoleValue === 'viewer' ? 'observer' : 'editor';
}
