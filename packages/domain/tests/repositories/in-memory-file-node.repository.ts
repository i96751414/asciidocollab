import { FileNode } from '../../src/entities/file-node';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { Timestamps } from '../../src/value-objects/timestamps';
import { FileNodeRepository } from '../../src/repositories/file-node.repository';

export class InMemoryFileNodeRepository implements FileNodeRepository {
  private readonly storage = new Map<string, FileNode>();

  async findById(id: FileNodeId): Promise<FileNode | null> {
    return this.storage.get(id.value) ?? null;
  }

  async findByParentId(parentId: FileNodeId): Promise<FileNode[]> {
    return Array.from(this.storage.values()).filter(
      (node) => node.parentId?.value === parentId.value,
    );
  }

  async findByProjectId(projectId: ProjectId): Promise<FileNode[]> {
    return Array.from(this.storage.values()).filter(
      (node) => node.projectId.value === projectId.value,
    );
  }

  async save(fileNode: FileNode): Promise<void> {
    this.storage.set(fileNode.id.value, fileNode);
  }

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

  async delete(id: FileNodeId): Promise<void> {
    this.storage.delete(id.value);
  }
}
