import { FileNode } from '../../entities/file-node';
import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { ProjectRepository } from '../../ports/project/project.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { ValidationError } from '../../errors/validation-error';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/** Return value carrying the file node and its absolute storage path. */
export interface DownloadFileResult {
  /** The resolved file node entity. */
  fileNode: FileNode;
  /** Absolute storage path used to open a read stream. */
  filePath: FilePath;
}

/** Authorises and resolves a single-file download request for a project member. */
export class DownloadFileUseCase {
  /**
   * @param projectRepo - Resolves project entities.
   * @param fileNodeRepo - Resolves file-node entities.
   * @param projectMemberRepo - Checks project membership.
   * @param fileStore - Opens read streams for stored files.
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /**
   * Verifies membership, resolves the file node (IDOR-guarded), and returns the path.
   *
   * @param actorId - ID of the requesting user.
   * @param projectId - Project that must own the node.
   * @param fileNodeId - ID of the node to download.
   * @returns A `Result` containing `{ fileNode, filePath }` or a domain error.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<DownloadFileResult, DomainError>> {
    const membership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!membership) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    if (fileNode.type.value !== 'file') {
      return { success: false, error: new ValidationError('Cannot download a folder — select a file node') };
    }

    return { success: true, value: { fileNode, filePath: fileNode.path } };
  }
}
