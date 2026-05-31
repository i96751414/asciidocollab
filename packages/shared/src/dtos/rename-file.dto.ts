/** Input data for renaming a file node. */
export interface RenameFileDto {
  /** ID of the user requesting the rename. */
  actorId: string;
  /** ID of the file node to rename. */
  fileNodeId: string;
  /** New name to assign to the file node. */
  newName: string;
  /** ID of the project that contains the file node. */
  projectId: string;
}

/** Output data returned after a file node is renamed. */
export interface RenameFileResultDto {
  /** ID of the renamed file node. */
  fileNodeId: string;
  /** Updated name of the file node. */
  newName: string;
  /** Updated full path of the file node after the rename. */
  newPath: string;
}
