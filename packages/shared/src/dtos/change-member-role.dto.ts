/** Input data for changing a member's role in a project. */
export interface ChangeMemberRoleDto {
  callerId: string;
  projectId: string;
  targetUserId: string;
  newRole: string;
}
