import { DownloadProjectUseCase } from '../../../src/use-cases/project/download-project';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
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

const PROJECT_ID   = '550e8400-e29b-41d4-a716-446655440001';
const MEMBER_ID    = '550e8400-e29b-41d4-a716-446655440002';
const NON_MEMBER   = '550e8400-e29b-41d4-a716-446655440003';
const ROOT_NODE_ID = '550e8400-e29b-41d4-a716-446655440004';
const FOLDER_ID    = '550e8400-e29b-41d4-a716-446655440005';
const FILE_1_ID    = '550e8400-e29b-41d4-a716-446655440006';
const FILE_2_ID    = '550e8400-e29b-41d4-a716-446655440007';

describe('DownloadProjectUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let useCase: DownloadProjectUseCase;

  const projectId  = ProjectId.create(PROJECT_ID);
  const memberId   = UserId.create(MEMBER_ID);
  const nonMember  = UserId.create(NON_MEMBER);
  const rootNodeId = FileNodeId.create(ROOT_NODE_ID);
  const folderId   = FileNodeId.create(FOLDER_ID);
  const file1Id    = FileNodeId.create(FILE_1_ID);
  const file2Id    = FileNodeId.create(FILE_2_ID);

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    useCase = new DownloadProjectUseCase(projectRepo, fileNodeRepo, memberRepo);

    // Project
    const project = new Project(projectId, ProjectName.create('Test Project'), null, [], rootNodeId);
    await projectRepo.save(project);

    // Root folder
    await fileNodeRepo.save(
      new FileNode(rootNodeId, projectId, null, 'Test Project', FileNodeType.create('folder'), FilePath.create('/')),
    );

    // A sub-folder: /docs
    await fileNodeRepo.save(
      new FileNode(folderId, projectId, rootNodeId, 'docs', FileNodeType.create('folder'), FilePath.create('/docs')),
    );

    // File 1 at root: /readme.adoc
    await fileNodeRepo.save(
      new FileNode(file1Id, projectId, rootNodeId, 'readme.adoc', FileNodeType.create('file'), FilePath.create('/readme.adoc')),
    );

    // File 2 nested: /docs/guide.adoc
    await fileNodeRepo.save(
      new FileNode(file2Id, projectId, folderId, 'guide.adoc', FileNodeType.create('file'), FilePath.create('/docs/guide.adoc')),
    );

    // Membership
    await memberRepo.addMember(new ProjectMember(projectId, memberId, Role.create('viewer')));
  });

  test('member receives project name and list of FILE nodes with relative paths', async () => {
    const result = await useCase.execute(memberId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.projectName).toBe('Test Project');

    const paths = result.value.files.map((f) => f.relativePath);
    expect(paths).toContain('readme.adoc');
    expect(paths).toContain('docs/guide.adoc');

    // Should NOT include folder nodes
    const nodeIds = result.value.files.map((f) => f.fileNode.id.value);
    expect(nodeIds).toContain(FILE_1_ID);
    expect(nodeIds).toContain(FILE_2_ID);
    expect(nodeIds).not.toContain(ROOT_NODE_ID);
    expect(nodeIds).not.toContain(FOLDER_ID);
  });

  test('non-member returns PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMember, projectId);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('result files list excludes folder nodes', async () => {
    const result = await useCase.execute(memberId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const { fileNode } of result.value.files) {
      expect(fileNode.type.value).toBe('file');
    }
  });

  test('relative paths strip leading slash', async () => {
    const result = await useCase.execute(memberId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const { relativePath } of result.value.files) {
      expect(relativePath).not.toMatch(/^\//);
    }
  });
});
