/** Input data for inviting a user to a project. */
export interface InviteUserDto {
  /** ID of the user sending the invitation. */
  actorId: string;
  /** ID of the project to which the user is being invited. */
  projectId: string;
  /** Email address of the user being invited. */
  email: string;
  /** Role to assign to the invited user upon joining. */
  role: string;
}
