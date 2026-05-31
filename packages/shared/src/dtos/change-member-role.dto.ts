/** Input data for changing a member's role in a project. */
export interface ChangeMemberRoleDto {
  /** ID of the user performing the role change. */
  actorId: string;
  /** ID of the project in which the role change is applied. */
  projectId: string;
  /** ID of the member whose role is being changed. */
  targetUserId: string;
  /** New role to assign to the target member. */
  newRole: string;
}
