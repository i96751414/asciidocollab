import { CreateFolderUseCase } from '../../../src/use-cases/file-tree/create-folder';
import { FileConflictError } from '../../../src/errors/file-conflict';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
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
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-node-not-found';

describe('CreateFolderUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: CreateFolderUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new CreateFolderUseCase(projectMemberRepo, fileNodeRepo, fileStore);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('creates FileNode and calls fileStore.createDirectory', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'myfolder');
    expect(result.success).toBe(true);
    if (result.success) {
      const fileNode = await fileNodeRepo.findById(result.value.fileNodeId);
      expect(fileNode?.type.value).toBe('folder');
    }
  });

  it('returns PermissionDeniedError for non-member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, rootFolderId, 'myfolder');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('returns FileNodeNotFoundError for unknown parent', async () => {
    const unknownId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const result = await useCase.execute(actorId, projectId, unknownId, 'myfolder');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });

  it('throws ValidationError for a folder name with path traversal (..)', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, '..'),
    ).rejects.toThrow();
  });

  it('throws ValidationError for a folder name with a forward slash', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, 'a/b'),
    ).rejects.toThrow();
  });

  it('throws ValidationError for an empty folder name', async () => {
    await expect(
      useCase.execute(actorId, projectId, rootFolderId, ''),
    ).rejects.toThrow();
  });

  it('creates a folder with spaces in the name', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'my folder');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.path.value).toBe('/my folder');
    }
  });

  it('creates a nested folder whose parent has spaces in its name', async () => {
    const parent = await useCase.execute(actorId, projectId, rootFolderId, 'my docs');
    expect(parent.success).toBe(true);
    if (!parent.success) return;

    const child = await useCase.execute(actorId, projectId, parent.value.fileNodeId, 'sub folder');
    expect(child.success).toBe(true);
    if (child.success) {
      expect(child.value.path.value).toBe('/my docs/sub folder');
    }
  });

  it('returns FileConflictError with existingId when folder with same name already exists under same parent', async () => {
    const first = await useCase.execute(actorId, projectId, rootFolderId, 'docs');
    expect(first.success).toBe(true);
    if (!first.success) return;
    const existingId = first.value.fileNodeId.value;

    const second = await useCase.execute(actorId, projectId, rootFolderId, 'docs');
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error).toBeInstanceOf(FileConflictError);
      expect((second.error as FileConflictError).existingId).toBe(existingId);
    }
  });
});
