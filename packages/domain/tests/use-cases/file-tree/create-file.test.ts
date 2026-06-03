import { CreateFileUseCase } from '../../../src/use-cases/file-tree/create-file';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { Role } from '../../../src/value-objects/role';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';
import { MimeType } from '../../../src/value-objects/mime-type';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-node-not-found';
import { FileConflictError } from '../../../src/errors/file-conflict';

describe('CreateFileUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let documentRepo: InMemoryDocumentRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: CreateFileUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const initialContent = Buffer.from('');
  const mimeType = MimeType.create('text/asciidoc');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    documentRepo = new InMemoryDocumentRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new CreateFileUseCase(projectMemberRepo, fileNodeRepo, documentRepo, fileStore);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('creates FileNode + Document + calls fileStore.createExclusive', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'newfile.adoc', mimeType, initialContent);
    expect(result.success).toBe(true);
    if (result.success) {
      const fileNode = await fileNodeRepo.findById(result.value.fileNodeId);
      expect(fileNode).not.toBeNull();
      const content = await fileStore.read(projectId, result.value.path);
      expect(content).not.toBeNull();
    }
  });

  it('returns FileConflictError when path is taken', async () => {
    await useCase.execute(actorId, projectId, rootFolderId, 'newfile.adoc', mimeType, initialContent);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'newfile.adoc', mimeType, initialContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileConflictError);
    }
  });

  it('returns PermissionDeniedError for non-member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, rootFolderId, 'test.adoc', mimeType, initialContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('returns FileNodeNotFoundError for unknown parent', async () => {
    const unknownId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const result = await useCase.execute(actorId, projectId, unknownId, 'test.adoc', mimeType, initialContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });

  it('throws ValidationError for a name with path traversal (..)', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, '../secret.adoc', mimeType, initialContent),
    ).rejects.toThrow();
  });

  it('throws ValidationError for a name containing a newline', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, 'bad\nname.adoc', mimeType, initialContent),
    ).rejects.toThrow();
  });

  it('throws ValidationError for a name with a forward slash', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, 'a/b.adoc', mimeType, initialContent),
    ).rejects.toThrow();
  });

  it('throws ValidationError for an empty name', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, '', mimeType, initialContent),
    ).rejects.toThrow();
  });

  it('creates a file with spaces in the name', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'my document.adoc', mimeType, initialContent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.path.value).toBe('/my document.adoc');
      const fileNode = await fileNodeRepo.findById(result.value.fileNodeId);
      expect(fileNode?.name).toBe('my document.adoc');
    }
  });
});

describe('CreateFileUseCase — orphan cleanup on DB failure', () => {
  let projectMemberRepo2: InMemoryProjectMemberRepository;
  let fileNodeRepo2: InMemoryFileNodeRepository;
  let documentRepo2: InMemoryDocumentRepository;
  let fileStore2: InMemoryProjectFileStore;

  const actorId2 = UserId.create('550e8400-e29b-41d4-a716-330000000001');
  const projectId2 = ProjectId.create('770e8400-e29b-41d4-a716-330000000003');
  const rootFolderId2 = FileNodeId.create('880e8400-e29b-41d4-a716-330000000004');

  beforeEach(async () => {
    projectMemberRepo2 = new InMemoryProjectMemberRepository();
    fileNodeRepo2 = new InMemoryFileNodeRepository();
    documentRepo2 = new InMemoryDocumentRepository();
    fileStore2 = new InMemoryProjectFileStore();

    const rootFolder2 = new FileNode(
      rootFolderId2, projectId2, null, 'root',
      FileNodeType.create('folder'), FilePath.create('/'),
    );
    await fileNodeRepo2.save(rootFolder2);
    await projectMemberRepo2.addMember(new ProjectMember(projectId2, actorId2, Role.create('editor')));
  });

  it('cleans up the disk file when fileNodeRepo.save throws after createExclusive succeeds', async () => {
    fileNodeRepo2.save = jest.fn().mockRejectedValue(new Error('DB down'));

    const useCase2 = new CreateFileUseCase(projectMemberRepo2, fileNodeRepo2, documentRepo2, fileStore2);

    await expect(
      useCase2.execute(actorId2, projectId2, rootFolderId2, 'new.adoc', MimeType.create('text/asciidoc'), Buffer.from(''))
    ).rejects.toThrow('DB down');

    // The file must have been cleaned up — no orphan on disk
    const orphan = await fileStore2.read(projectId2, FilePath.create('/new.adoc'));
    expect(orphan).toBeNull();
  });
});
