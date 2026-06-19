import { GetFileNodeContentUseCase } from '../../../src/use-cases/content/get-file-node-content';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryAssetRepository } from '../../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryCollaborationSessionRepository } from '../../ports/project/in-memory-collaboration-session-repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
import { Asset } from '../../../src/entities/asset';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { ProjectName } from '../../../src/value-objects/project/project-name';
import { Role } from '../../../src/value-objects/identity/role';
import { FileNodeType } from '../../../src/value-objects/files/file-node-type';
import { FilePath } from '../../../src/value-objects/files/file-path';
import { MimeType } from '../../../src/value-objects/files/mime-type';
import { ContentId } from '../../../src/value-objects/ids/content-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-tree/file-node-not-found';
import { ContentNotFoundError } from '../../../src/errors/content/content-not-found';
import type { CollaborativeContentReader } from '../../../src/ports/storage/collaborative-content-reader';
import type { Result } from '../../../src/types/result';

const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
const documentFileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
const imgFileNodeId = FileNodeId.create('aa1e8400-e29b-41d4-a716-446655440006');
const documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');
const documentPath = FilePath.create('/test.adoc');
const imgPath = FilePath.create('/photo.png');
const documentContent = Buffer.from('= Hello\nWorld');
const imgContent = Buffer.alloc(64, 0xFF);

// Live collaborative source-of-truth: a document open for collaborative editing has its
// authoritative text in the Hocuspocus/Yjs room, not the lagging file-store projection. The read
// must surface that live text so cross-document attribute resolution (and any other reader) never
// sees stale content for a file with an open session.
const liveReaderReturning = (value: string | null): CollaborativeContentReader => ({
  async readContent(): Promise<Result<string | null, Error>> {
    return { success: true, value };
  },
});

describe('GetFileNodeContentUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let documentRepo: InMemoryDocumentRepository;
  let assetRepo: InMemoryAssetRepository;
  let fileStore: InMemoryProjectFileStore;
  let sessionRepo: InMemoryCollaborationSessionRepository;
  let useCase: GetFileNodeContentUseCase;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    documentRepo = new InMemoryDocumentRepository();
    assetRepo = new InMemoryAssetRepository();
    fileStore = new InMemoryProjectFileStore();
    sessionRepo = new InMemoryCollaborationSessionRepository();

    useCase = new GetFileNodeContentUseCase(projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    // AsciiDoc document file
    const documentNode = new FileNode(documentFileNodeId, projectId, rootFolderId, 'test.adoc', FileNodeType.create('file'), documentPath);
    await fileNodeRepo.save(documentNode);

    const document = new Document(
      documentId,
      documentFileNodeId,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009'),
      MimeType.create('text/asciidoc'),
    );
    await documentRepo.save(document);

    await fileStore.write(projectId, documentPath, documentContent);

    // Image asset file
    const imgNode = new FileNode(imgFileNodeId, projectId, rootFolderId, 'photo.png', FileNodeType.create('file'), imgPath);
    await fileNodeRepo.save(imgNode);

    // Asset.id == FileNode.id
    const asset = new Asset(imgFileNodeId, MimeType.create('image/png'), 64n);
    await assetRepo.save(asset);

    await fileStore.write(projectId, imgPath, imgContent);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  // Document (text) file path
  it('returns document content with mimeType and contentId for a text file', async () => {
    const result = await useCase.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toEqual(documentContent);
      expect(result.value.mimeType.value).toBe('text/asciidoc');
      expect(result.value.contentId).toBe('cc0e8400-e29b-41d4-a716-446655440008');
    }
  });

  it('returns LIVE collaborative content for a document with an open session (not the file store)', async () => {
    const liveContent = '= Hello\nLIVE unsaved edit';
    await sessionRepo.open(projectId, documentId);
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, liveReaderReturning(liveContent), sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content.toString('utf8')).toBe(liveContent);
      expect(result.value.content).not.toEqual(documentContent); // proves it did NOT read the stale file store
      expect(result.value.mimeType.value).toBe('text/asciidoc');
      expect(result.value.contentId).toBe('cc0e8400-e29b-41d4-a716-446655440008');
    }
  });

  it('falls back to the file store when there is no live source (reader returns null)', async () => {
    await sessionRepo.open(projectId, documentId);
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, liveReaderReturning(null), sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content).toEqual(documentContent);
  });

  it('falls back to the file store when the live reader fails (collab unreachable — resilient)', async () => {
    await sessionRepo.open(projectId, documentId);
    const failingReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string | null, Error>> {
        return { success: false, error: new Error('collab unreachable') };
      },
    };
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, failingReader, sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content).toEqual(documentContent);
  });

  it('LOGS the live-read failure (observable) before falling back to the file store', async () => {
    await sessionRepo.open(projectId, documentId);
    const readError = new Error('collab unreachable');
    const failingReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string | null, Error>> {
        return { success: false, error: readError };
      },
    };
    const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const logger = { warn: (message: string, meta?: Record<string, unknown>) => warnings.push({ message, meta }) };
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, failingReader, sessionRepo, logger,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    // The swallowed failure must be surfaced exactly once, carrying the underlying error for diagnosis.
    expect(warnings).toHaveLength(1);
    expect(warnings[0].meta?.error).toBe(readError);
    // …and the read still degrades gracefully to the file store (resilient).
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content).toEqual(documentContent);
  });

  it('does NOT log when the live read succeeds (live value used, no fallback)', async () => {
    await sessionRepo.open(projectId, documentId);
    const warnings: string[] = [];
    const logger = { warn: (message: string) => warnings.push(message) };
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, liveReaderReturning('LIVE'), sessionRepo, logger,
    );
    await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(warnings).toHaveLength(0);
  });

  it('reads LIVE content when the document has an active collaboration session', async () => {
    await sessionRepo.open(projectId, documentId);
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, liveReaderReturning('LIVE'), sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content.toString('utf8')).toBe('LIVE');
  });

  it('does NOT consult the live reader when there is no active session (file store is authoritative)', async () => {
    // Session NOT opened — the file store is current for a dormant document, so the use case must
    // skip the collab round-trip entirely.
    let consulted = false;
    const spyReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string | null, Error>> {
        consulted = true;
        return { success: true, value: 'LIVE-should-not-be-used' };
      },
    };
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, spyReader, sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(consulted).toBe(false);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content).toEqual(documentContent);
  });

  it('an active session whose live doc is EMPTY returns empty content (authoritative), not the stale file store', async () => {
    await sessionRepo.open(projectId, documentId);
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, liveReaderReturning(''), sessionRepo,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content.toString('utf8')).toBe('');
      expect(result.value.content).not.toEqual(documentContent);
    }
  });

  it('does NOT consult the live reader for binary asset files (no collaborative session)', async () => {
    let consulted = false;
    const spyReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string | null, Error>> {
        consulted = true;
        return { success: true, value: null };
      },
    };
    const useCaseWithReader = new GetFileNodeContentUseCase(
      projectMemberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, spyReader,
    );
    const result = await useCaseWithReader.execute(actorId, projectId, imgFileNodeId);
    expect(result.success).toBe(true);
    expect(consulted).toBe(false);
  });

  it('returns asset content with mimeType for an image file (no contentId)', async () => {
    const result = await useCase.execute(actorId, projectId, imgFileNodeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toEqual(imgContent);
      expect(result.value.mimeType.value).toBe('image/png');
      expect(result.value.contentId).toBeUndefined();
    }
  });

  it('returns PermissionDeniedError for non-member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, documentFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('returns FileNodeNotFoundError for unknown node', async () => {
    const unknownId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const result = await useCase.execute(actorId, projectId, unknownId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });

  it('returns ContentNotFoundError when document file is missing from store', async () => {
    await fileStore.remove(projectId, documentPath);
    const result = await useCase.execute(actorId, projectId, documentFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ContentNotFoundError);
    }
  });

  it('returns ContentNotFoundError when asset has no record (findById returns null)', async () => {
    // Remove the asset record (but keep the file node and file store content)
    await assetRepo.delete(imgFileNodeId);
    const result = await useCase.execute(actorId, projectId, imgFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ContentNotFoundError);
    }
  });

  it('returns ContentNotFoundError when asset file is missing from store', async () => {
    await fileStore.remove(projectId, imgPath);
    const result = await useCase.execute(actorId, projectId, imgFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ContentNotFoundError);
    }
  });

  it('rejects read when fileNodeId belongs to a different project', async () => {
    const otherProjectId = ProjectId.create('ee0e8400-e29b-41d4-a716-446655440099');
    const otherRootFolderId = FileNodeId.create('ee4e8400-e29b-41d4-a716-446655440099');
    const otherFileNodeId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const foreignRootFolder = new FileNode(
      otherRootFolderId,
      otherProjectId,
      null,
      'OtherProject',
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );
    await fileNodeRepo.save(foreignRootFolder);
    const foreignNode = new FileNode(
      otherFileNodeId,
      otherProjectId,
      otherRootFolderId,
      'foreign.adoc',
      FileNodeType.create('file'),
      FilePath.create('/foreign.adoc'),
    );
    await fileNodeRepo.save(foreignNode);

    const result = await useCase.execute(actorId, projectId, otherFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });
});
