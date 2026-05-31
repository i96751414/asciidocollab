import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { FileNode, FileNodeId, ProjectId, FileNodeType, FilePath, Timestamps, FileNodeRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `FileNodeRepository` interface.
 * Maps between domain `FileNode` entities and the `FileNode` database table.
 * File nodes form a tree structure via `parentId` within a project.
 */
export class PrismaFileNodeRepository implements FileNodeRepository {
  /** Creates a new PrismaFileNodeRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the file node.
   * @returns The file node if found, null otherwise.
   */
  async findById(id: FileNodeId): Promise<FileNode | null> {
    const record = await this.prisma.fileNode.findUnique({ where: { id: id.value } });
    return record ? toDomainFileNode(record) : null;
  }

  /**
   * @param parentId - The parent folder's identifier.
   * @returns All direct children of the given parent node.
   */
  async findByParentId(parentId: FileNodeId): Promise<FileNode[]> {
    const records = await this.prisma.fileNode.findMany({ where: { parentId: parentId.value } });
    return records.map(toDomainFileNode);
  }

  /**
   * @param projectId - The project ID to filter by.
   * @returns All file nodes belonging to the given project.
   */
  async findByProjectId(projectId: ProjectId): Promise<FileNode[]> {
    const records = await this.prisma.fileNode.findMany({ where: { projectId: projectId.value } });
    return records.map(toDomainFileNode);
  }

  /**
   * Creates or updates a file node. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param fileNode - The file node entity to persist.
   */
  async save(fileNode: FileNode): Promise<void> {
    const data = toPersistenceFileNode(fileNode);
    await this.prisma.fileNode.upsert({
      where: { id: fileNode.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * Moves a file node to a new parent folder.
   * 
   * @param id - The file node to move.
   * @param newParentId - The target parent folder.
   */
  async move(id: FileNodeId, newParentId: FileNodeId): Promise<void> {
    await this.prisma.fileNode.update({
      where: { id: id.value },
      data: { parentId: newParentId.value },
    });
  }

  /**
   * @param id - The unique identifier of the file node to delete.
   */
  async delete(id: FileNodeId): Promise<void> {
    await this.prisma.fileNode.deleteMany({ where: { id: id.value } });
  }
}

type FileNodeRecord = {
  id: string; projectId: string; parentId: string | null;
  name: string; type: string; path: string; createdAt: Date; updatedAt: Date;
};

function toDomainFileNode(record: FileNodeRecord): FileNode {
  return new FileNode(
    FileNodeId.create(record.id),
    ProjectId.create(record.projectId),
    record.parentId ? FileNodeId.create(record.parentId) : null,
    record.name,
    FileNodeType.create(record.type.toLowerCase()),
    FilePath.create(record.path),
    new Timestamps(record.createdAt, record.updatedAt),
  );
}

function toPersistenceFileNode(fileNode: FileNode): Prisma.FileNodeUncheckedCreateInput {
  return {
    id: fileNode.id.value,
    projectId: fileNode.projectId.value,
    parentId: fileNode.parentId?.value ?? null,
    name: fileNode.name,
    type: fileNode.type.value === 'file' ? 'FILE' : 'FOLDER',
    path: fileNode.path.value,
    createdAt: fileNode.createdAt,
    updatedAt: fileNode.updatedAt,
  };
}
