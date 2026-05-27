/** Input data for inviting a user to a project. */
export interface InviteUserDto {
  actorId: string;
  projectId: string;
  email: string;
  role: string;
}
