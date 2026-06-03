import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { FilePath } from '../value-objects/file-path';
import { MimeType } from '../value-objects/mime-type';
import { ContentId } from '../value-objects/content-id';
import { YjsStateId } from '../value-objects/yjs-state-id';
import { DocumentId } from '../value-objects/document-id';
import { FileNodeType } from '../value-objects/file-node-type';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectFileStore } from '../storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { FileNodeNotFoundError } from '../errors/file-node-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { FileNode } from '../entities/file-node';
import { Document } from '../entities/document';
import { randomUUID } from 'crypto';

/** Creates a new AsciiDoc document node in the file tree and its corresponding content file. */
export class CreateFileUseCase {
  /** Initializes the use case with the repositories and file store required to create a file. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, creates the file on disk and in the database, and returns the new node's ID and path. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    parentId: FileNodeId,
    name: string,
    mimeType: MimeType,
    initialContent: Buffer,
  ): Promise<Result<{ fileNodeId: FileNodeId; path: FilePath }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const parent = await this.fileNodeRepo.findById(parentId);
    if (!parent || parent.type.value !== 'folder') {
      return { success: false, error: new FileNodeNotFoundError(parentId.value) };
    }

    const parentPath = parent.path.value === '/' ? '/' : `${parent.path.value}/`;
    const newPath = FilePath.create(`${parentPath}${name}`);

    const storeResult = await this.fileStore.createExclusive(projectId, newPath, initialContent);
    if (!storeResult.success) {
      return { success: false, error: storeResult.error };
    }

    try {
      const fileNodeId = FileNodeId.create(randomUUID());
      const fileNode = new FileNode(fileNodeId, projectId, parentId, name, FileNodeType.create('file'), newPath);
      await this.fileNodeRepo.save(fileNode);

      const documentId = DocumentId.create(randomUUID());
      const document = new Document(
        documentId,
        fileNodeId,
        ContentId.create(randomUUID()),
        YjsStateId.create(randomUUID()),
        mimeType,
      );
      await this.documentRepo.save(document);

      return { success: true, value: { fileNodeId, path: newPath } };
    } catch (error) {
      await this.fileStore.remove(projectId, newPath);
      throw error;
    }
  }
}
