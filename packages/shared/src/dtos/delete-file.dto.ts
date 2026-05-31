/** Input data for deleting a file node. */
export interface DeleteFileDto {
  /** ID of the user requesting the deletion. */
  actorId: string;
  /** ID of the file node to delete. */
  fileNodeId: string;
  /** ID of the project that contains the file node. */
  projectId: string;
}
