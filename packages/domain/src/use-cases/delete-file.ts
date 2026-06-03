import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { ProjectId } from '../value-objects/project-id';
import { AuditLogId } from '../value-objects/audit-log-id';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { YjsStateStore } from '../storage/yjs-state-store';
import { YjsStateId } from '../value-objects/yjs-state-id';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { CannotDeleteRootFolderError } from '../errors/cannot-delete-root-folder';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/**
 * Deletes a file or folder (and its descendants) from a project.
 * Requires the actorId to be a member of the project.
 * The root folder cannot be deleted.
 */
export class DeleteFileUseCase {
  /** Creates a new DeleteFileUseCase instance. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly fileStore?: ProjectFileStore,
    private readonly yjsStateStore?: YjsStateStore,
  ) {}

  /**
   * Deletes a file or folder (and its descendants) from a project.
   *
   * @param actorId - The user requesting the deletion.
   * @param fileNodeId - The file or folder to delete.
   * @param projectId - The project containing the file or folder.
   * @returns Void on success.
   * On failure returns `PermissionDeniedError` if `actorId` is not a project member,
   * `FileNodeNotFoundError` if the file node does not exist, or
   * `CannotDeleteRootFolderError` if the target is the project root folder.
   */
  async execute(
    actorId: UserId,
    fileNodeId: FileNodeId,
    projectId: ProjectId,
  ): Promise<Result<void, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
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
      // Filesystem cleanup after DB deletions (RT-5 ordering)
      if (this.fileStore) {
        await this.fileStore.remove(projectId, fileNode.path);
      }
      if (document && this.yjsStateStore) {
        try {
          await this.yjsStateStore.delete(projectId, document.yjsStateId);
        } catch {
          // Yjs state cleanup failed; DB records are already deleted so the deletion
          // is semantically complete. The orphaned blob will need manual cleanup.
        }
      }
    } else {
      await this.deleteFolderRecursively(fileNodeId, projectId);
      if (this.fileStore) {
        await this.fileStore.removeDirectory(projectId, fileNode.path);
      }
    }

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'file.deleted',
      'FileNode',
      fileNodeId.value,
    );
    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }

  private async deleteFolderRecursively(folderId: FileNodeId, projectId: ProjectId): Promise<void> {
    const stack: FileNodeId[] = [folderId];
    const toDelete: FileNodeId[] = [];
    const yjsStateIds: YjsStateId[] = [];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      toDelete.push(currentId);

      const children = await this.fileNodeRepo.findByParentId(currentId);

      for (const child of children) {
        if (child.type.value === 'file') {
          const document = await this.documentRepo.findByFileNodeId(child.id);
          if (document) {
            yjsStateIds.push(document.yjsStateId);
            await this.documentRepo.delete(document.id);
          }
          toDelete.push(child.id);
        } else {
          stack.push(child.id);
        }
      }
    }

    // eslint-disable-next-line unicorn/no-array-reverse
    for (const id of [...toDelete].reverse()) {
      await this.fileNodeRepo.delete(id);
    }

    if (this.yjsStateStore) {
      for (const stateId of yjsStateIds) {
        await this.yjsStateStore.delete(projectId, stateId);
      }
    }
  }
}
