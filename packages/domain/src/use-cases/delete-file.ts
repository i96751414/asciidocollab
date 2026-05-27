import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { ProjectId } from '../value-objects/project-id';
import { AuditLogId } from '../value-objects/audit-log-id';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { CannotDeleteRootFolderError } from '../errors/cannot-delete-root-folder';
import { DomainError } from '../errors/domain-error';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

/**
 * Deletes a file or folder (and its descendants) from a project.
 * Requires the actor to be a member of the project.
 * The root folder cannot be deleted.
 */
export class DeleteFileUseCase {
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * @param actor - The user requesting the deletion.
   * @param fileNodeId - The file or folder to delete.
   * @param projectId - The project containing the file or folder.
   * @returns void on success.
   * @throws PermissionDeniedError if the actor is not a project member.
   * @throws FileNodeNotFoundError if the file node does not exist.
   * @throws CannotDeleteRootFolderError if the target is the project root folder.
   */
  async execute(
    actor: UserId,
    fileNodeId: FileNodeId,
    projectId: ProjectId,
  ): Promise<Result<void, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actor);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    if (fileNode.parentId === null) {
      return { success: false, error: new CannotDeleteRootFolderError(fileNodeId.value) };
    }

    if (fileNode.type.value === 'file') {
      const document = await this.documentRepo.findByFileNodeId(fileNodeId);
      if (document) {
        await this.documentRepo.delete(document.id);
      }
      await this.fileNodeRepo.delete(fileNodeId);
    } else {
      await this.deleteFolderRecursively(fileNodeId);
    }

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actor,
      projectId,
      'file.deleted',
      'FileNode',
      fileNodeId.value,
    );
    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }

  private async deleteFolderRecursively(folderId: FileNodeId): Promise<void> {
    const stack: FileNodeId[] = [folderId];
    const toDelete: FileNodeId[] = [];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      toDelete.push(currentId);

      const children = await this.fileNodeRepo.findByParentId(currentId);

      for (const child of children) {
        if (child.type.value === 'file') {
          const document = await this.documentRepo.findByFileNodeId(child.id);
          if (document) {
            await this.documentRepo.delete(document.id);
          }
          toDelete.push(child.id);
        } else {
          stack.push(child.id);
        }
      }
    }

    for (const id of toDelete.reverse()) {
      await this.fileNodeRepo.delete(id);
    }
  }
}
