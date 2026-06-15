import { DownloadFileUseCase } from '../../../src/use-cases/project/download-file';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { Project } from '../../../src/entities/project';
import { FileNode } from '../../../src/entities/file-node';
import { ProjectMember } from '../../../src/entities/project-member';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { ProjectName } from '../../../src/value-objects/project/project-name';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { FileNodeType } from '../../../src/value-objects/files/file-node-type';
import { FilePath } from '../../../src/value-objects/files/file-path';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { Role } from '../../../src/value-objects/identity/role';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { FileNodeNotFoundError } from '../../../src/errors/file-tree/file-node-not-found';
import { ValidationError } from '../../../src/errors/common/validation-error';

const PROJECT_ID   = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_PID    = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID    = '550e8400-e29b-41d4-a716-446655440003';
const NON_MEMBER   = '550e8400-e29b-41d4-a716-446655440004';
const ROOT_NODE_ID = '550e8400-e29b-41d4-a716-446655440005';
const FILE_NODE_ID = '550e8400-e29b-41d4-a716-446655440006';
const FOLDER_ID    = '550e8400-e29b-41d4-a716-446655440007';
const OTHER_FILE   = '550e8400-e29b-41d4-a716-446655440008';

describe('DownloadFileUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: DownloadFileUseCase;

  const projectId  = ProjectId.create(PROJECT_ID);
  const otherPid   = ProjectId.create(OTHER_PID);
  const memberId   = UserId.create(MEMBER_ID);
  const nonMember  = UserId.create(NON_MEMBER);
  const rootNodeId = FileNodeId.create(ROOT_NODE_ID);
  const fileNodeId = FileNodeId.create(FILE_NODE_ID);
  const folderId   = FileNodeId.create(FOLDER_ID);
  const otherFile  = FileNodeId.create(OTHER_FILE);

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    fileStore = new InMemoryProjectFileStore();
    useCase = new DownloadFileUseCase(projectRepo, fileNodeRepo, memberRepo, fileStore);

    // Project
    const project = new Project(projectId, ProjectName.create('My Project'), null, [], rootNodeId);
    await projectRepo.save(project);

    // Root folder (parentId=null, type=folder)
    const rootFolder = new FileNode(
      rootNodeId, projectId, null, 'My Project',
      FileNodeType.create('folder'), FilePath.create('/'),
    );
    await fileNodeRepo.save(rootFolder);

    // A file node in this project
    const fileNode = new FileNode(
      fileNodeId, projectId, rootNodeId, 'readme.adoc',
      FileNodeType.create('file'), FilePath.create('/readme.adoc'),
    );
    await fileNodeRepo.save(fileNode);
    await fileStore.write(projectId, FilePath.create('/readme.adoc'), Buffer.from('= Hello'));

    // A folder node in this project
    const folderNode = new FileNode(
      folderId, projectId, rootNodeId, 'docs',
      FileNodeType.create('folder'), FilePath.create('/docs'),
    );
    await fileNodeRepo.save(folderNode);

    // A file node belonging to a DIFFERENT project (IDOR test)
    const otherProject = new Project(otherPid, ProjectName.create('Other Project'), null, [], null);
    await projectRepo.save(otherProject);
    // Use rootNodeId as a parentId placeholder — cross-project parent is fine in-memory
    const otherFileNode = new FileNode(
      otherFile, otherPid, rootNodeId, 'other-file.adoc',
      FileNodeType.create('file'), FilePath.create('/other-file.adoc'),
    );
    await fileNodeRepo.save(otherFileNode);
    await fileStore.write(otherPid, FilePath.create('/other-file.adoc'), Buffer.from('other'));

    // Membership
    await memberRepo.addMember(new ProjectMember(projectId, memberId, Role.create('viewer')));
  });

  test('member can download a file — returns fileNode and filePath', async () => {
    const result = await useCase.execute(memberId, projectId, fileNodeId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.fileNode.id.value).toBe(FILE_NODE_ID);
    expect(result.value.filePath.value).toBe('/readme.adoc');
  });

  test('non-member returns PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMember, projectId, fileNodeId);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('fileNodeId belonging to a different project returns FileNodeNotFoundError (IDOR guard)', async () => {
    // otherFile belongs to otherPid, not projectId
    const result = await useCase.execute(memberId, projectId, otherFile);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  });

  test('folder node returns ValidationError', async () => {
    const result = await useCase.execute(memberId, projectId, folderId);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(ValidationError);
  });
});
