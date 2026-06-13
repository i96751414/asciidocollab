import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { AUDIT_FILE_MOVED } from '../../audit-actions';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { CannotDeleteRootFolderError } from '../../errors/cannot-delete-root-folder';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { FileNode } from '../../entities/file-node';
import { Timestamps } from '../../value-objects/timestamps';
import { cascadePathUpdate, buildParentPath } from './file-tree-helpers';
import { ReferenceExtractor } from '../../ports/asciidoc/reference-extractor';
import { PathResolver } from '../../ports/asciidoc/path-resolver';
import { rewriteReferencesForPathChanges, capturePathChanges } from './reference-rewrite';

/** Moves a file or folder to a different parent folder within the same project. */
export class MoveFileUseCase {
  /** Initializes the use case with the repositories and file store required to move a node. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
    // Optional cross-file refactoring dependencies (US12/FR-066). When both are
    // injected, references to the moved node are rewritten to keep resolving;
    // when absent the move behaves exactly as before.
    private readonly extractor?: ReferenceExtractor,
    private readonly pathResolver?: PathResolver,
  ) {}

  /** Validates membership, moves the file on disk to its new parent path, and updates the database record. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
    newParentId: FileNodeId,
    context?: RequestContext,
  ): Promise<Result<{ fileNodeId: FileNodeId; newPath: FilePath; mainFileCleared: boolean }, DomainError>> {
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

    if (fileNode.parentId === null) {
      return { success: false, error: new CannotDeleteRootFolderError(fileNodeId.value) };
    }

    const newParent = await this.fileNodeRepo.findById(newParentId);
    if (!newParent || newParent.type.value !== 'folder' || newParent.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(newParentId.value) };
    }

    const parentPath = buildParentPath(newParent.path.value);
    const newPath = FilePath.create(`${parentPath}${fileNode.name}`);

    const moveResult = await this.fileStore.move(projectId, fileNode.path, newPath);
    if (!moveResult.success) {
      return { success: false, error: moveResult.error };
    }

    const updated = new FileNode(
      fileNode.id,
      fileNode.projectId,
      newParentId,
      fileNode.name,
      fileNode.type,
      newPath,
      new Timestamps(fileNode.createdAt, new Date()),
    );
    // Capture the old → new path map BEFORE the cascade rewrites descendant paths,
    // so references to the moved node (and, for a folder, all its descendants) can
    // be rewritten below (FR-066).
    const canRewrite = this.extractor !== undefined && this.pathResolver !== undefined;
    const pathChanges = canRewrite
      ? await capturePathChanges(this.fileNodeRepo, fileNode, newPath)
      : new Map<string, string>();

    await this.fileNodeRepo.save(updated);

    if (fileNode.type.value === 'folder') {
      await cascadePathUpdate(this.fileNodeRepo, fileNodeId, fileNode.path.value + '/', newPath.value + '/');
    }

    if (this.extractor && this.pathResolver) {
      // Best-effort (FR-066): the move has already persisted to disk + DB, so a
      // reference-rewrite I/O failure must not fail the move — log and continue,
      // mirroring how audit-write failures are handled.
      try {
        await rewriteReferencesForPathChanges(
          { fileNodeRepo: this.fileNodeRepo, fileStore: this.fileStore, extractor: this.extractor, pathResolver: this.pathResolver },
          projectId,
          pathChanges,
        );
      } catch (error) {
        this.logger?.warn('Cross-file reference rewrite failed after move', { error, fileNodeId: fileNodeId.value });
      }
    }

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: AUDIT_FILE_MOVED,
      resourceType: 'FileNode',
      resourceId: fileNodeId.value,
      metadata: { from: fileNode.path.value, to: newPath.value },
      context,
    }, this.logger);

    // A move never changes the file's identity, so a configured main file keeps
    // pointing at it (FR-070) — nothing to clear.
    return { success: true, value: { fileNodeId, newPath, mainFileCleared: false } };
  }
}
