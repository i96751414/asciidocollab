import { FileNode } from '../../entities/file-node';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ProjectNotFoundError } from '../../errors/project/project-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/** Single file entry within the project download archive. */
export interface DownloadProjectFile {
  /** The resolved file node entity. */
  fileNode: FileNode;
  /** Path relative to the project root, with no leading slash. */
  relativePath: string;
}

/** Return value containing the project name and all its downloadable files. */
export interface DownloadProjectResult {
  /** Human-readable project name, used as the ZIP archive filename prefix. */
  projectName: string;
  /** All FILE-type nodes with their relative paths. */
  files: DownloadProjectFile[];
}

/** Collects all files for a project ZIP download after verifying membership. */
export class DownloadProjectUseCase {
  /**
   * @param projectRepo - Resolves project entities.
   * @param fileNodeRepo - Resolves file-node entities.
   * @param projectMemberRepo - Checks project membership.
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
  ) {}

  /**
   * Verifies membership, fetches all FILE nodes, and returns them with relative paths.
   *
   * @param actorId - ID of the requesting user.
   * @param projectId - Project to download.
   * @returns A `Result` containing `{ projectName, files }` or a domain error.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<DownloadProjectResult, DomainError>> {
    const membership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!membership) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const allNodes = await this.fileNodeRepo.findByProjectId(projectId);
    const files: DownloadProjectFile[] = allNodes
      .filter((node) => node.type.value === 'file')
      .map((node) => ({
        fileNode: node,
        relativePath: node.path.value.replace(/^\//, ''),
      }));

    return {
      success: true,
      value: { projectName: project.name.value, files },
    };
  }
}
