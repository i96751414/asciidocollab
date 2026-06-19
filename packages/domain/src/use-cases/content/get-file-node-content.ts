import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { AssetRepository } from '../../ports/file-tree/asset.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { CollaborationSessionRepository } from '../../ports/project/collaboration-session.repository';
import { Logger } from '../../ports/observability/logger';
import { ContentNotFoundError } from '../../errors/content/content-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { MimeType } from '../../value-objects/files/mime-type';

/** Result type that includes an optional contentId (present for documents, absent for assets). */
export interface FileNodeContent {
  /** Raw file bytes. */
  content: Buffer;
  /** MIME type of the file. */
  mimeType: MimeType;
  /** Content record id — present for text documents, absent for binary assets. */
  contentId?: string;
}

/**
 * Reads the raw bytes for any file node — documents (AsciiDoc/text) or binary assets (images).
 * Tries the document store first; falls back to the asset store when no document record exists.
 *
 * For text documents the authoritative source of truth is the collaborative Yjs document owned by
 * the collaboration server, not the plain-text file-store projection (which only lags behind on a
 * debounced write-back). So when a {@link CollaborativeContentReader} is supplied, a document read
 * consults the live collaborative state first and uses it whenever a live source exists — only
 * falling back to the file store when there is no live source (a never-opened document) or the
 * collaboration server is unreachable. This keeps every reader of a document (including the editor's
 * cross-document attribute resolution) consistent with what collaborators currently see, instead of
 * reading a file that may have an open session with unsaved edits.
 */
export class GetFileNodeContentUseCase {
  /**
   * Creates a new GetFileNodeContentUseCase.
   *
   * @param liveContentReader - Optional reader for a document's live collaborative text; when
   *   omitted, document reads come straight from the file store (the pre-collaboration behavior).
   * @param collaborationSessionRepo - Optional repository for checking whether a document has an
   *   active collaboration session. The live reader is consulted only when a session is active;
   *   for a dormant document the file store is already current (the collab server writes back on
   *   disconnect), so the blocking collab round-trip is skipped entirely.
   * @param logger - Optional observability sink. A live read that FAILS (session active but the
   *   collaboration server is unreachable) is a graceful degradation to the file store, but it must
   *   not be silent: it is logged here so a stale-content fallback is diagnosable. Missing ⇒ silence.
   */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly assetRepo: AssetRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly liveContentReader?: CollaborativeContentReader,
    private readonly collaborationSessionRepo?: CollaborationSessionRepository,
    private readonly logger?: Logger,
  ) {}

  /** Reads the raw bytes for the given file node, checking project membership first. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<FileNodeContent, DomainError>> {
    const access = await requireMemberAndFileNode(this.projectMemberRepo, this.fileNodeRepo, projectId, actorId, fileNodeId);
    if (!access.success) return access;
    const { fileNode } = access;

    // Try document record first (text files / AsciiDoc).
    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (document) {
      // Prefer the live collaborative text (the Yjs source of truth) so a document with an open
      // session reflects unsaved edits; fall back to the file-store projection only when there is no
      // live source or the collaboration server cannot be reached. Only consult the live reader when
      // the document has an ACTIVE collaboration session — a dormant document's file store is already
      // current (the collab server writes back on disconnect), so skip the blocking collab round-trip.
      const sessionActive = this.liveContentReader && this.collaborationSessionRepo
        ? await this.collaborationSessionRepo.isActive(projectId, document.id)
        : false;
      const live = sessionActive && this.liveContentReader
        ? await this.liveContentReader.readContent(projectId, document.yjsStateId)
        : null;
      if (live?.success && live.value !== null) {
        return { success: true, value: { content: Buffer.from(live.value, 'utf8'), mimeType: document.mimeType, contentId: document.contentId.value } };
      }
      // A session was active but the live read FAILED (collab server unreachable). Falling back to the
      // file-store projection keeps the read resilient, but the projection may lag unsaved edits, so the
      // degradation must be observable rather than silently serving stale content.
      if (live && !live.success) {
        this.logger?.warn('Live collaborative read failed; falling back to file store (content may be stale)', {
          error: live.error,
          projectId: projectId.value,
          fileNodeId: fileNodeId.value,
        });
      }

      const content = await this.fileStore.read(projectId, fileNode.path);
      if (!content) {
        return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
      }
      return { success: true, value: { content, mimeType: document.mimeType, contentId: document.contentId.value } };
    }

    // Fall back to asset record (binary/image files). Asset.id == FileNode.id.
    const asset = await this.assetRepo.findById(fileNodeId);
    if (!asset) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    const content = await this.fileStore.read(projectId, fileNode.path);
    if (!content) {
      return { success: false, error: new ContentNotFoundError(fileNode.path.value) };
    }

    return { success: true, value: { content, mimeType: asset.mimeType } };
  }
}
