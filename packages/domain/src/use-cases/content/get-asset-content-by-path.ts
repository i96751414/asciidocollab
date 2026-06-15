import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { MimeType } from '../../value-objects/files/mime-type';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-tree/file-node-not-found';
import { ContentNotFoundError } from '../../errors/content/content-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/**
 * Normalizes a request path to the stored FilePath form: a single leading slash, no empty
 * or dot segments. Returns null when the path contains traversal (`.`/`..`) segments.
 */
function normalizePath(path: string): string | null {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  return '/' + segments.join('/');
}

/**
 * Reads the raw bytes of an uploaded asset addressed by its path within the project
 * (e.g. `/images/diagram.png`). This backs the preview's image base path: AsciiDoc image
 * macros reference files by path, not by id, so the preview must resolve them by path.
 */
export class GetAssetContentByPathUseCase {
  /** Initializes the use case with the repositories and file store needed to retrieve asset content. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /**
   * Validates membership, resolves the file path to a file node within the project, reads its
   * bytes from the store, and returns them with metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    path: string,
  ): Promise<Result<{ bytes: Buffer; mimeType: MimeType; filename: string }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const normalized = normalizePath(path);
    if (!normalized) {
      return { success: false, error: new FileNodeNotFoundError(path) };
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);
    const fileNode = nodes.find((node) => node.type.value === 'file' && node.path.value === normalized);
    if (!fileNode) {
      return { success: false, error: new FileNodeNotFoundError(normalized) };
    }

    const asset = await this.assetRepo.findById(fileNode.id);
    if (!asset) {
      return { success: false, error: new FileNodeNotFoundError(fileNode.id.value) };
    }

    const bytes = await this.fileStore.read(projectId, fileNode.path);
    if (!bytes) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { bytes, mimeType: asset.mimeType, filename: fileNode.name } };
  }
}
