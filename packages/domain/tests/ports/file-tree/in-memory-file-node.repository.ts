import { FileNode } from '../../../src/entities/file-node';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { FileNodeRepository } from '../../../src/ports/file-tree/file-node.repository';

/** In-memory implementation of FileNodeRepository for use in tests. */
export class InMemoryFileNodeRepository implements FileNodeRepository {
  private readonly storage = new Map<string, FileNode>();

  /** Returns the file node with the given ID, or null if not found. */
  async findById(id: FileNodeId): Promise<FileNode | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns all file nodes that are direct children of the given parent node. */
  async findByParentId(parentId: FileNodeId): Promise<FileNode[]> {
    return [...this.storage.values()].filter(
      (node) => node.parentId?.value === parentId.value,
    );
  }

  /** Returns all file nodes belonging to the given project. */
  async findByProjectId(projectId: ProjectId): Promise<FileNode[]> {
    return [...this.storage.values()].filter(
      (node) => node.projectId.value === projectId.value,
    );
  }

  /** Stores a file node in memory, overwriting any existing entry with the same ID. */
  async save(fileNode: FileNode): Promise<void> {
    this.storage.set(fileNode.id.value, fileNode);
  }

  /** Moves the file node to a new parent by rebuilding it with an updated parent ID and timestamp. */
  async move(id: FileNodeId, newParentId: FileNodeId): Promise<void> {
    const node = this.storage.get(id.value);
    if (node) {
      const moved = new FileNode(
        node.id,
        node.projectId,
        newParentId,
        node.name,
        node.type,
        node.path,
        new Timestamps(node.createdAt, new Date()),
      );
      this.storage.set(id.value, moved);
    }
  }

  /** Removes the file node with the given ID from memory. */
  async delete(id: FileNodeId): Promise<void> {
    this.storage.delete(id.value);
  }
}
