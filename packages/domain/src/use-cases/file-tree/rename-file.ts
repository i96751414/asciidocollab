import { FileNode } from '../../entities/file-node';
import { Timestamps } from '../../value-objects/timestamps';
import { cascadePathUpdate } from './file-tree-helpers';
import { UserId } from '../../value-objects/user-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectId } from '../../value-objects/project-id';
import { FilePath } from '../../value-objects/file-path';
import { FileName } from '../../value-objects/file-name';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { AUDIT_FILE_RENAMED } from '../../audit-actions';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

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
    private readonly logger?: Logger,
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
    context?: RequestContext,
  ): Promise<Result<{ fileNodeId: FileNodeId; newName: string; newPath: FilePath }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      await recordAuthorizationDenial(this.auditLogRepo, {
        actorId,
        projectId,
        resourceType: 'FileNode',
        resourceId: fileNodeId.value,
        reason: 'not_a_project_member',
        context,
      }, this.logger);
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    FileName.create(newName); // throws ValidationError for invalid names
    const previousName = fileNode.name;
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
        await cascadePathUpdate(this.fileNodeRepo, fileNodeId, fileNode.path.value + '/', newPath.value + '/');
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

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: AUDIT_FILE_RENAMED,
      resourceType: 'FileNode',
      resourceId: fileNodeId.value,
      metadata: { previousName, newName },
      context,
    }, this.logger);

    return {
      success: true,
      value: { fileNodeId, newName, newPath },
    };
  }
}
