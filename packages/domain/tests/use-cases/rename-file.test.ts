import { RenameFileUseCase } from '../../src/use-cases/rename-file';
import { FileNodeNotFoundError } from '../../src/errors/file-node-not-found';
import { InMemoryProjectMemberRepository } from '../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAuditLogRepository } from '../ports/admin/in-memory-audit-log.repository';
import { InMemoryProjectRepository } from '../ports/project/in-memory-project.repository';
import { InMemoryProjectFileStore } from '../ports/storage/in-memory-project-file-store';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { FileNode } from '../../src/entities/file-node';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { FileNodeType } from '../../src/value-objects/file-node-type';
import { FilePath } from '../../src/value-objects/file-path';

describe('RenameFileUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: RenameFileUseCase;
  let actorId: UserId;
  let otherUser: UserId;
  let projectId: ProjectId;
  let project: Project;
  let rootFolderId: FileNodeId;
  let rootFolder: FileNode;
  let fileNode: FileNode;
  let fileNodeId: FileNodeId;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();

    useCase = new RenameFileUseCase(
      projectMemberRepo,
      fileNodeRepo,
      auditLogRepo,
    );

    actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
    otherUser = UserId.create('660e8400-e29b-41d4-a716-446655440002');
    projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
    rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
    fileNodeId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');

    project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      rootFolderId,
    );
    await projectRepo.save(project);

    rootFolder = new FileNode(
      rootFolderId,
      projectId,
      null,
      'Test Project',
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );
    await fileNodeRepo.save(rootFolder);

    fileNode = new FileNode(
      fileNodeId,
      projectId,
      rootFolderId,
      'original-name.txt',
      FileNodeType.create('file'),
      FilePath.create('/original-name.txt'),
    );
    await fileNodeRepo.save(fileNode);

    const member = new ProjectMember(
      projectId,
      actorId,
      Role.create('editor'),
    );
    await projectMemberRepo.addMember(member);
  });

  test('renames a file and updates name, path, and creates audit log', async () => {
    const result = await useCase.execute(actorId, fileNodeId, 'new-name.txt', projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.fileNodeId.value).toBe(fileNodeId.value);
    expect(result.value.newName).toBe('new-name.txt');
    expect(result.value.newPath.value).toBe('/new-name.txt');

    const updated = await fileNodeRepo.findById(fileNodeId);
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('new-name.txt');
    expect(updated!.path.value).toBe('/new-name.txt');

    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('file.renamed');
    expect(logs[0].userId.value).toBe(actorId.value);
  });

  test('returns error for non-existent file', async () => {
    const missingId = FileNodeId.create('aaaa0000-e29b-41d4-a716-446655440000');
    const result = await useCase.execute(actorId, missingId, 'new-name.txt', projectId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.name).toBe('FileNodeNotFoundError');
  });

  test('returns error when actorId is not a project member', async () => {
    const result = await useCase.execute(otherUser, fileNodeId, 'new-name.txt', projectId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.name).toBe('PermissionDeniedError');
  });
});

describe('RenameFileUseCase with ProjectFileStore', () => {
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: RenameFileUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
  const oldPath = FilePath.create('/original-name.txt');
  const fileContent = Buffer.from('hello');

  beforeEach(async () => {
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, fileStore);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'original-name.txt', FileNodeType.create('file'), oldPath);
    await fileNodeRepo.save(fileNode);
    await fileStore.write(projectId, oldPath, fileContent);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  test('fileStore.move called with old and new path', async () => {
    await useCase.execute(actorId, fileNodeId, 'new-name.txt', projectId);
    const oldContent = await fileStore.read(projectId, oldPath);
    const newContent = await fileStore.read(projectId, FilePath.create('/new-name.txt'));
    expect(oldContent).toBeNull();
    expect(newContent).toEqual(fileContent);
  });

  test('returns FileConflictError when new path occupied', async () => {
    await fileStore.write(projectId, FilePath.create('/new-name.txt'), Buffer.from('existing'));
    const result = await useCase.execute(actorId, fileNodeId, 'new-name.txt', projectId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('FileConflictError');
    }
  });

  it('updates descendant FileNode paths in DB when renaming a folder', async () => {
    const fileStore = new InMemoryProjectFileStore();
    const useCaseWithStore = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, fileStore);

    const documentsFolderId = FileNodeId.create('dd0e8400-e29b-41d4-a716-446655440020');
    const introId = FileNodeId.create('dd0e8400-e29b-41d4-a716-446655440021');

    const documentsFolder = new FileNode(documentsFolderId, projectId, rootFolderId, 'docs', FileNodeType.create('folder'), FilePath.create('/docs'));
    await fileNodeRepo.save(documentsFolder);
    await fileStore.createDirectory(projectId, FilePath.create('/docs'));

    const introFile = new FileNode(introId, projectId, documentsFolderId, 'intro.adoc', FileNodeType.create('file'), FilePath.create('/docs/intro.adoc'));
    await fileNodeRepo.save(introFile);
    await fileStore.write(projectId, FilePath.create('/docs/intro.adoc'), Buffer.from('content'));

    const result = await useCaseWithStore.execute(actorId, documentsFolderId, 'documentation', projectId);
    expect(result.success).toBe(true);

    const updatedIntro = await fileNodeRepo.findById(introId);
    expect(updatedIntro?.path.value).toBe('/documentation/intro.adoc');
  });

  it('updates deeply nested descendants (3 levels) when renaming a folder', async () => {
    const levelOneStore = new InMemoryProjectFileStore();
    const useCaseDeep = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, levelOneStore);

    const topId = FileNodeId.create('a10e8400-e29b-41d4-a716-446655440040');
    const midId = FileNodeId.create('b10e8400-e29b-41d4-a716-446655440041');
    const leafId = FileNodeId.create('c10e8400-e29b-41d4-a716-446655440042');

    await fileNodeRepo.save(new FileNode(topId, projectId, rootFolderId, 'top', FileNodeType.create('folder'), FilePath.create('/top')));
    await fileNodeRepo.save(new FileNode(midId, projectId, topId, 'mid', FileNodeType.create('folder'), FilePath.create('/top/mid')));
    await fileNodeRepo.save(new FileNode(leafId, projectId, midId, 'leaf.adoc', FileNodeType.create('file'), FilePath.create('/top/mid/leaf.adoc')));
    await levelOneStore.createDirectory(projectId, FilePath.create('/top'));
    await levelOneStore.createDirectory(projectId, FilePath.create('/top/mid'));
    await levelOneStore.write(projectId, FilePath.create('/top/mid/leaf.adoc'), Buffer.from('leaf'));

    const result = await useCaseDeep.execute(actorId, topId, 'root', projectId);
    expect(result.success).toBe(true);

    const updatedMid = await fileNodeRepo.findById(midId);
    const updatedLeaf = await fileNodeRepo.findById(leafId);
    expect(updatedMid?.path.value).toBe('/root/mid');
    expect(updatedLeaf?.path.value).toBe('/root/mid/leaf.adoc');
  });

  it('returns PermissionDeniedError (not FileNodeNotFoundError) when actor is not a member', async () => {
    const nonMember = UserId.create('000e8400-e29b-41d4-a716-446655440099');
    const result = await useCase.execute(nonMember, fileNodeId, 'any.adoc', projectId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('PermissionDeniedError');
    }
  });

  it('returns FileNodeNotFoundError when the file node belongs to a different project', async () => {
    const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const alienNodeId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440013');
    const alienNode = new FileNode(
      alienNodeId,
      otherProjectId,
      rootFolderId,
      'alien.adoc',
      FileNodeType.create('file'),
      FilePath.create('/alien.adoc'),
    );
    await fileNodeRepo.save(alienNode);

    const result = await useCase.execute(actorId, alienNodeId, 'new-name.adoc', projectId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });
});

describe('RenameFileUseCase with fileStore — filesystem rollback on DB failure', () => {
  let projectRepo2: InMemoryProjectRepository;
  let fileNodeRepo2: InMemoryFileNodeRepository;
  let projectMemberRepo2: InMemoryProjectMemberRepository;
  let auditLogRepo2: InMemoryAuditLogRepository;
  let fileStore2: InMemoryProjectFileStore;

  const actorId2 = UserId.create('550e8400-e29b-41d4-a716-110000000001');
  const projectId2 = ProjectId.create('770e8400-e29b-41d4-a716-110000000003');
  const rootFolderId2 = FileNodeId.create('880e8400-e29b-41d4-a716-110000000004');
  const fileNodeId2 = FileNodeId.create('990e8400-e29b-41d4-a716-110000000005');

  beforeEach(async () => {
    projectRepo2 = new InMemoryProjectRepository();
    fileNodeRepo2 = new InMemoryFileNodeRepository();
    projectMemberRepo2 = new InMemoryProjectMemberRepository();
    auditLogRepo2 = new InMemoryAuditLogRepository();
    fileStore2 = new InMemoryProjectFileStore();

    const project2 = new Project(projectId2, ProjectName.create('Test Project'), null, [], rootFolderId2);
    await projectRepo2.save(project2);

    const rootFolder2 = new FileNode(rootFolderId2, projectId2, null, 'root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo2.save(rootFolder2);

    const fileNode2 = new FileNode(fileNodeId2, projectId2, rootFolderId2, 'original.txt', FileNodeType.create('file'), FilePath.create('/original.txt'));
    await fileNodeRepo2.save(fileNode2);

    await fileStore2.write(projectId2, FilePath.create('/original.txt'), Buffer.from('hello'));
    await projectMemberRepo2.addMember(new ProjectMember(projectId2, actorId2, Role.create('editor')));
  });

  it('rolls back filesystem rename when fileNodeRepo.save throws after fileStore.move succeeds', async () => {
    // Make the FIRST save call (for the renamed file node) throw
    let callCount = 0;
    const originalSave = fileNodeRepo2.save.bind(fileNodeRepo2);
    fileNodeRepo2.save = jest.fn(async (node: FileNode) => {
      callCount++;
      if (callCount === 1) throw new Error('DB failure');
      return originalSave(node);
    }) as typeof fileNodeRepo2.save;

    const useCase2 = new RenameFileUseCase(projectMemberRepo2, fileNodeRepo2, auditLogRepo2, fileStore2);

    // The use case must propagate the error (not silently swallow it)
    let caughtError: unknown = null;
    try {
      await useCase2.execute(actorId2, fileNodeId2, 'renamed.txt', projectId2);
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).not.toBeNull();

    // The file must still be accessible at the ORIGINAL path (rollback succeeded)
    const originalContent = await fileStore2.read(projectId2, FilePath.create('/original.txt'));
    expect(originalContent).not.toBeNull();

    // The file must NOT exist at the new path (rollback removed it)
    const newContent = await fileStore2.read(projectId2, FilePath.create('/renamed.txt'));
    expect(newContent).toBeNull();
  });
});
