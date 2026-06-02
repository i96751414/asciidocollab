import { RenameFileUseCase } from '../../src/use-cases/rename-file';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../repositories/in-memory-file-node.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
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
});
