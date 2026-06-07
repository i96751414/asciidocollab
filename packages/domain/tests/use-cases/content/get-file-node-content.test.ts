import { GetFileNodeContentUseCase } from '../../../src/use-cases/content/get-file-node-content';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryAssetRepository } from '../../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
import { Asset } from '../../../src/entities/asset';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { DocumentId } from '../../../src/value-objects/document-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { Role } from '../../../src/value-objects/role';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';
import { MimeType } from '../../../src/value-objects/mime-type';
import { ContentId } from '../../../src/value-objects/content-id';
import { YjsStateId } from '../../../src/value-objects/yjs-state-id';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-node-not-found';
import { ContentNotFoundError } from '../../../src/errors/content-not-found';

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

describe('GetFileNodeContentUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let documentRepo: InMemoryDocumentRepository;
  let assetRepo: InMemoryAssetRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: GetFileNodeContentUseCase;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    documentRepo = new InMemoryDocumentRepository();
    assetRepo = new InMemoryAssetRepository();
    fileStore = new InMemoryProjectFileStore();

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
