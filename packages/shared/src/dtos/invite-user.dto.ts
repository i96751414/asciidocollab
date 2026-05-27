/** Input data for inviting a user to a project. */
export interface InviteUserDto {
  callerId: string;
  projectId: string;
  email: string;
  role: string;
}
