/** Input data for removing a member from a project. */
export interface RemoveMemberDto {
  callerId: string;
  projectId: string;
  targetUserId: string;
}
