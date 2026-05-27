import { FileNodeId } from '../value-objects/file-node-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeType } from '../value-objects/file-node-type';
import { FilePath } from '../value-objects/file-path';
import { Timestamps } from '../value-objects/timestamps';

/**
 * Represents a node in a project's file tree.
 *
 * A node can be either a folder or a file. Folders may contain child nodes;
 * files are leaves. Nodes at the root level (parentId === null) must always
 * be folders.
 *
 * @invariant Root-level nodes (parentId === null) must have type === 'folder'.
 */
export class FileNode {
  constructor(
    /** Unique identifier for this node. */
    public readonly id: FileNodeId,
    /** The project this node belongs to. */
    public readonly projectId: ProjectId,
    /** Identifier of the parent folder, or null for root-level nodes. */
    public readonly parentId: FileNodeId | null,
    /** Human-readable file or folder name. */
    public readonly name: string,
    /** Whether this node is a 'file' or a 'folder'. */
    public readonly type: FileNodeType,
    /** Logical path derived from the node hierarchy. */
    public readonly path: FilePath,
    /** Creation and last-update timestamps. Defaults to the current time. */
    public readonly timestamps: Timestamps = new Timestamps(),
  ) {
    if (this.type.value === 'file' && this.parentId === null) {
      throw new Error('File at root level must be a folder');
    }
  }

  get createdAt(): Date {
    return this.timestamps.createdAt;
  }

  get updatedAt(): Date {
    return this.timestamps.updatedAt;
  }
}
