/** Input data for retrieving a project's file tree. */
export interface GetProjectTreeDto {
  actor: string;
  projectId: string;
}

/**
 * A recursive tree node representing a file or folder in the project tree.
 * Leaf nodes have an empty `children` array; folders contain nested nodes.
 */
export interface FileTreeNodeDto {
  id: string;
  name: string;
  type: string;
  path: string;
  mimeType?: string;
  children: FileTreeNodeDto[];
}

/** Output data returned with the project's file tree. */
export interface GetProjectTreeResultDto {
  root: FileTreeNodeDto;
}
