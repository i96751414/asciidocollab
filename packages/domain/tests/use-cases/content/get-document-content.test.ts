import { GetDocumentContentUseCase } from '../../../src/use-cases/content/get-document-content';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
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
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-node-not-found';
import { ContentNotFoundError } from '../../../src/errors/content-not-found';

describe('GetDocumentContentUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let documentRepo: InMemoryDocumentRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: GetDocumentContentUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
  const documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');
  const filePath = FilePath.create('/test.adoc');
  const fileContent = Buffer.from('= Hello\nWorld');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    documentRepo = new InMemoryDocumentRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new GetDocumentContentUseCase(projectMemberRepo, fileNodeRepo, documentRepo, fileStore);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'test.adoc', FileNodeType.create('file'), filePath);
    await fileNodeRepo.save(fileNode);

    const document = new Document(
      documentId,
      fileNodeId,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009'),
      MimeType.create('text/asciidoc'),
    );
    await documentRepo.save(document);

    await fileStore.write(projectId, filePath, fileContent);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('returns content for project member', async () => {
    const result = await useCase.execute(actorId, projectId, fileNodeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toEqual(fileContent);
    }
  });

  it('returns PermissionDeniedError for non-member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, fileNodeId);
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

  it('returns ContentNotFoundError when file missing from store', async () => {
    await fileStore.remove(projectId, filePath);
    const result = await useCase.execute(actorId, projectId, fileNodeId);
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

    // Also create a Document for the foreign node so execution reaches the ownership check
    const foreignDoc = new Document(
      DocumentId.create('ee1e8400-e29b-41d4-a716-446655440099'),
      otherFileNodeId,
      ContentId.create('ee2e8400-e29b-41d4-a716-446655440099'),
      YjsStateId.create('ee3e8400-e29b-41d4-a716-446655440099'),
      MimeType.create('text/asciidoc'),
    );
    await documentRepo.save(foreignDoc);

    // Put content at the foreign path in our project's store (the probe target)
    await fileStore.write(projectId, FilePath.create('/foreign.adoc'), Buffer.from('secret'));

    const result = await useCase.execute(actorId, projectId, otherFileNodeId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });
});
