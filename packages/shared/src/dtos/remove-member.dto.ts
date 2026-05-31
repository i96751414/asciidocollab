/** Input data for removing a member from a project. */
export interface RemoveMemberDto {
  /** ID of the user performing the removal. */
  actorId: string;
  /** ID of the project from which the member is being removed. */
  projectId: string;
  /** ID of the member to remove from the project. */
  targetUserId: string;
}
