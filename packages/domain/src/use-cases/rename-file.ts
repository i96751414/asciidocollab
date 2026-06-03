import { FileNode } from '../entities/file-node';
import { Timestamps } from '../value-objects/timestamps';
import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { ProjectId } from '../value-objects/project-id';
import { FilePath } from '../value-objects/file-path';
import { AuditLogId } from '../value-objects/audit-log-id';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { randomUUID } from 'crypto';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';

/**
 * Renames a file or folder within a project and records an audit log entry.
 * Requires the actorId to be a member of the project.
 */
export class RenameFileUseCase {
  /** Creates a new RenameFileUseCase instance. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly fileStore?: ProjectFileStore,
  ) {}

  /**
   * Renames a file or folder within a project and records an audit log entry.
   *
   * @param actorId - The user performing the rename.
   * @param fileNodeId - The file or folder to rename.
   * @param newName - The new name for the file or folder.
   * @param projectId - The project containing the file or folder.
   * @returns The updated file node ID, new name, and new path.
   * On failure returns `PermissionDeniedError` if `actorId` is not a project member,
   * or `FileNodeNotFoundError` if the file node does not exist.
   */
  async execute(
    actorId: UserId,
    fileNodeId: FileNodeId,
    newName: string,
    projectId: ProjectId,
  ): Promise<Result<{ fileNodeId: FileNodeId; newName: string; newPath: FilePath }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const pathString = fileNode.path.value;
    const lastSlash = pathString.lastIndexOf('/');
    const parentPath = pathString.slice(0, lastSlash + 1);
    const newPath = FilePath.create(parentPath + newName);

    if (this.fileStore) {
      const moveResult = await this.fileStore.move(projectId, fileNode.path, newPath);
      if (!moveResult.success) {
        return { success: false, error: moveResult.error };
      }
    }

    try {
      const updatedFileNode = new FileNode(
        fileNode.id,
        fileNode.projectId,
        fileNode.parentId,
        newName,
        fileNode.type,
        newPath,
        new Timestamps(fileNode.createdAt, new Date()),
      );

      await this.fileNodeRepo.save(updatedFileNode);

      if (fileNode.type.value === 'folder') {
        await this.cascadePathUpdate(fileNodeId, fileNode.path.value + '/', newPath.value + '/');
      }
    } catch (error) {
      if (this.fileStore) {
        try {
          await this.fileStore.move(projectId, newPath, fileNode.path);
        } catch {
          // Rollback failed — filesystem and DB are now inconsistent.
          // The original error is re-thrown below.
        }
      }
      throw error;
    }

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'file.renamed',
      'FileNode',
      fileNodeId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return {
      success: true,
      value: { fileNodeId, newName, newPath },
    };
  }

  private async cascadePathUpdate(folderId: FileNodeId, oldPathPrefix: string, newPathPrefix: string): Promise<void> {
    const children = await this.fileNodeRepo.findByParentId(folderId);
    for (const child of children) {
      const newChildPath = FilePath.create(newPathPrefix + child.path.value.slice(oldPathPrefix.length));
      const updatedChild = new FileNode(
        child.id,
        child.projectId,
        child.parentId,
        child.name,
        child.type,
        newChildPath,
        new Timestamps(child.createdAt, new Date()),
      );
      await this.fileNodeRepo.save(updatedChild);
      if (child.type.value === 'folder') {
        await this.cascadePathUpdate(child.id, oldPathPrefix + child.name + '/', newPathPrefix + child.name + '/');
      }
    }
  }
}
