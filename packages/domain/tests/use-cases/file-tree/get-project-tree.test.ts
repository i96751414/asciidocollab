import { GetProjectTreeUseCase, FileTreeNode } from '../../../src/use-cases/file-tree/get-project-tree';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
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

describe('GetProjectTreeUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let documentRepo: InMemoryDocumentRepository;
  let useCase: GetProjectTreeUseCase;
  let actorId: UserId;
  let otherUser: UserId;
  let projectId: ProjectId;
  let rootFolderId: FileNodeId;
  let subFolderId: FileNodeId;
  let fileId: FileNodeId;
  let documentId: DocumentId;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    documentRepo = new InMemoryDocumentRepository();

    useCase = new GetProjectTreeUseCase(
      projectMemberRepo,
      fileNodeRepo,
      documentRepo,
      projectRepo,
    );

    actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
    otherUser = UserId.create('660e8400-e29b-41d4-a716-446655440002');
    projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
    rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
    subFolderId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
    fileId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
    documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');

    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      rootFolderId,
    );
    await projectRepo.save(project);

    const rootFolder = new FileNode(
      rootFolderId,
      projectId,
      null,
      'Test Project',
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );
    await fileNodeRepo.save(rootFolder);

    const subFolder = new FileNode(
      subFolderId,
      projectId,
      rootFolderId,
      'sub-folder',
      FileNodeType.create('folder'),
      FilePath.create('/sub-folder'),
    );
    await fileNodeRepo.save(subFolder);

    const file = new FileNode(
      fileId,
      projectId,
      rootFolderId,
      'readme.md',
      FileNodeType.create('file'),
      FilePath.create('/readme.md'),
    );
    await fileNodeRepo.save(file);

    const document = new Document(
      documentId,
      fileId,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009'),
      MimeType.create('text/markdown'),
    );
    await documentRepo.save(document);

    const member = new ProjectMember(
      projectId,
      actorId,
      Role.create('editor'),
    );
    await projectMemberRepo.addMember(member);
  });

  test('returns nested tree with root folder containing children', async () => {
    const result = await useCase.execute(actorId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const root = result.value.root;

    expect(root.id).toBe(rootFolderId.value);
    expect(root.name).toBe('Test Project');
    expect(root.type).toBe('folder');
    expect(root.path).toBe('/');
    expect(root.mimeType).toBeUndefined();

    expect(root.children).toHaveLength(2);

    const subFolderNode = root.children.find((c: FileTreeNode) => c.name === 'sub-folder');
    expect(subFolderNode).toBeDefined();
    expect(subFolderNode!.type).toBe('folder');
    expect(subFolderNode!.path).toBe('/sub-folder');
    expect(subFolderNode!.children).toHaveLength(0);
    expect(subFolderNode!.mimeType).toBeUndefined();

    const fileNode = root.children.find((c: FileTreeNode) => c.name === 'readme.md');
    expect(fileNode).toBeDefined();
    expect(fileNode!.type).toBe('file');
    expect(fileNode!.path).toBe('/readme.md');
    expect(fileNode!.children).toHaveLength(0);
  });

  test('file nodes include mimeType when document exists', async () => {
    const result = await useCase.execute(actorId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const root = result.value.root;
    const fileNode = root.children.find((c: FileTreeNode) => c.type === 'file');

    expect(fileNode).toBeDefined();
    expect(fileNode!.mimeType).toBe('text/markdown');
  });

  test('non-existent project returns error', async () => {
    const missingId = ProjectId.create('eeeeeeee-e29b-41d4-a716-446655440000');
    const result = await useCase.execute(actorId, missingId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.name).toBe('ProjectNotFoundError');
  });

  test('non-member cannot access tree', async () => {
    const result = await useCase.execute(otherUser, projectId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.name).toBe('PermissionDeniedError');
  });
});
