/** Represents a node in the project file tree, either a file or a folder. */
export interface FileTreeNode {
  /** Unique identifier of the file node. */
  id: string;
  /** Display name of the file or folder. */
  name: string;
  /** Whether this node is a file or a folder. */
  type: 'file' | 'folder';
  /** Absolute path of this node within the project. */
  path: string;
  /** Identifier of the parent folder node, or null for the root. */
  parentId: string | null;
  /** Direct children of this node (populated for folders). */
  children: FileTreeNode[];
}
