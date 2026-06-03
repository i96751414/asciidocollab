/** Emitted via SSE when a file tree structural change occurs in a project. */
export interface FileTreeEventDto {
  /** The kind of change that occurred ('created', 'deleted', 'renamed', or 'moved'). */
  type: 'created' | 'deleted' | 'renamed' | 'moved';
  /** Unique identifier of the affected file node. */
  fileNodeId: string;
  /** Whether the affected node is a file or a folder. */
  nodeType: 'file' | 'folder';
  /** Current display name of the node after the change. */
  name: string;
  /** Absolute path of the node within the project after the change. */
  path: string;
  /** Identifier of the parent folder node, or null for the root. */
  parentId: string | null;
}
