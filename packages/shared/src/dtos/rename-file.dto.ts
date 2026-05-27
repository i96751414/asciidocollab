/** Input data for renaming a file node. */
export interface RenameFileDto {
  actor: string;
  fileNodeId: string;
  newName: string;
  projectId: string;
}

/** Output data returned after a file node is renamed. */
export interface RenameFileResultDto {
  fileNodeId: string;
  newName: string;
  newPath: string;
}
