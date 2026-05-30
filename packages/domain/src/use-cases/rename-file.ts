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
  /**
   *
   */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly auditLogRepo: AuditLogRepository,
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
    if (!fileNode) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    const pathString = fileNode.path.value;
    const lastSlash = pathString.lastIndexOf('/');
    const parentPath = pathString.slice(0, lastSlash + 1);
    const newPath = FilePath.create(parentPath + newName);

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
}
