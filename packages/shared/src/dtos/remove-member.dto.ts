/** Input data for removing a member from a project. */
export interface RemoveMemberDto {
  actorId: string;
  projectId: string;
  targetUserId: string;
}
