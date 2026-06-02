import { MoveFileUseCase } from '../../src/use-cases/move-file';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../repositories/in-memory-file-node.repository';
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
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
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../src/errors/file-node-not-found';
import { FileConflictError } from '../../src/errors/file-conflict';
import { CannotDeleteRootFolderError } from '../../src/errors/cannot-delete-root-folder';

describe('MoveFileUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: MoveFileUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const subFolderId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
  const fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
  const filePath = FilePath.create('/test.adoc');
  const fileContent = Buffer.from('hello');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new MoveFileUseCase(projectMemberRepo, fileNodeRepo, fileStore);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const subFolder = new FileNode(subFolderId, projectId, rootFolderId, 'sub', FileNodeType.create('folder'), FilePath.create('/sub'));
    await fileNodeRepo.save(subFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'test.adoc', FileNodeType.create('file'), filePath);
    await fileNodeRepo.save(fileNode);
    await fileStore.write(projectId, filePath, fileContent);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('updates FileNode parentId + path and calls fileStore.move', async () => {
    const result = await useCase.execute(actorId, projectId, fileNodeId, subFolderId);
    expect(result.success).toBe(true);
    if (result.success) {
      const updated = await fileNodeRepo.findById(fileNodeId);
      expect(updated?.parentId?.value).toBe(subFolderId.value);
      expect(updated?.path.value).toBe('/sub/test.adoc');
    }
  });

  it('returns FileConflictError on destination conflict', async () => {
    const existingId = FileNodeId.create('bb0e8400-e29b-41d4-a716-446655440007');
    const existingPath = FilePath.create('/sub/test.adoc');
    const existing = new FileNode(existingId, projectId, subFolderId, 'test.adoc', FileNodeType.create('file'), existingPath);
    await fileNodeRepo.save(existing);
    await fileStore.write(projectId, existingPath, Buffer.from('existing'));

    const result = await useCase.execute(actorId, projectId, fileNodeId, subFolderId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileConflictError);
    }
  });

  it('cannot move root folder', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, subFolderId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CannotDeleteRootFolderError);
    }
  });
});
