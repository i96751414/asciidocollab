/** Input data for retrieving a project's file tree. */
export interface GetProjectTreeDto {
  /** ID of the user requesting the file tree. */
  actorId: string;
  /** ID of the project whose file tree is being retrieved. */
  projectId: string;
}

/**
 * A recursive tree node representing a file or folder in the project tree.
 * Leaf nodes have an empty `children` array; folders contain nested nodes.
 */
export interface FileTreeNodeDto {
  /** Unique identifier of the file or folder node. */
  id: string;
  /** Display name of the file or folder. */
  name: string;
  /** Node type, either a file or a folder. */
  type: string;
  /** Full path of the node within the project tree. */
  path: string;
  /** MIME type of the file, present only for file nodes. */
  mimeType?: string;
  /** Child nodes nested under this folder; empty for file nodes. */
  children: FileTreeNodeDto[];
}

/** Output data returned with the project's file tree. */
export interface GetProjectTreeResultDto {
  /** Root node of the project's file tree. */
  root: FileTreeNodeDto;
}
