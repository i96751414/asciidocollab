import { SetProjectMainFileUseCase } from '../../../src/use-cases/project/set-project-main-file';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { ProjectId } from '../../../src/value-objects/project-id';
import { UserId } from '../../../src/value-objects/user-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { ProjectName } from '../../../src/value-objects/project-name';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';
import { Role } from '../../../src/value-objects/role';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { ProjectNotFoundError } from '../../../src/errors/project-not-found';
import { MainFileNotFoundError } from '../../../src/errors/main-file-not-found';
import { MainFileNotAsciidocError } from '../../../src/errors/main-file-not-asciidoc';

const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440010');
const editorId = UserId.create('550e8400-e29b-41d4-a716-446655440011');
const ownerId = UserId.create('550e8400-e29b-41d4-a716-446655440012');
const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440013');
const rootId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440020');
const adocId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440021');
const txtId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440022');
const folderId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440023');
const otherProjectNodeId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440024');

describe('SetProjectMainFileUseCase', () => {
  let useCase: SetProjectMainFileUseCase;
  let projectRepo: InMemoryProjectRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let fileRepo: InMemoryFileNodeRepository;
  let auditRepo: InMemoryAuditLogRepository;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    fileRepo = new InMemoryFileNodeRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new SetProjectMainFileUseCase(projectRepo, memberRepo, fileRepo, auditRepo);

    await projectRepo.save(new Project(projectId, ProjectName.create('Proj'), null, [], rootId));
    await memberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner'), new Date()));
    await memberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(projectId, viewerId, Role.create('viewer'), new Date()));

    await fileRepo.save(new FileNode(adocId, projectId, rootId, 'main.adoc', FileNodeType.create('file'), FilePath.create('/main.adoc')));
    await fileRepo.save(new FileNode(txtId, projectId, rootId, 'notes.txt', FileNodeType.create('file'), FilePath.create('/notes.txt')));
    await fileRepo.save(new FileNode(folderId, projectId, null, 'chapters', FileNodeType.create('folder'), FilePath.create('/chapters')));
    await fileRepo.save(new FileNode(otherProjectNodeId, ProjectId.create('550e8400-e29b-41d4-a716-446655440099'), rootId, 'x.adoc', FileNodeType.create('file'), FilePath.create('/x.adoc')));
  });

  test('an editor can set the main file', async () => {
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: adocId.value });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.mainFileNodeId?.value).toBe(adocId.value);
  });

  test('an owner can set the main file', async () => {
    const result = await useCase.execute(ownerId, projectId, { mainFileNodeId: adocId.value });
    expect(result.success).toBe(true);
  });

  test('a viewer is denied and an authorization-denial audit entry is recorded', async () => {
    const result = await useCase.execute(viewerId, projectId, { mainFileNodeId: adocId.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const allLogs = await auditRepo.findAll();
    const denial = allLogs.find((log) => log.action === 'authz.denied');
    expect(denial).toBeDefined();
    expect(denial!.resourceType).toBe('Project');
  });

  test('clearing the main file (null) is allowed for an editor', async () => {
    await useCase.execute(editorId, projectId, { mainFileNodeId: adocId.value });
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.mainFileNodeId).toBeNull();
  });

  test('a non-existent node → MainFileNotFoundError', async () => {
    const missing = '550e8400-e29b-41d4-a716-4466554400ff';
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: missing });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MainFileNotFoundError);
  });

  test('a node from another project → MainFileNotFoundError', async () => {
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: otherProjectNodeId.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MainFileNotFoundError);
  });

  test('a non-.adoc file → MainFileNotAsciidocError', async () => {
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: txtId.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MainFileNotAsciidocError);
  });

  test('a folder → MainFileNotAsciidocError', async () => {
    const result = await useCase.execute(editorId, projectId, { mainFileNodeId: folderId.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(MainFileNotAsciidocError);
  });

  test('an unknown project → ProjectNotFoundError', async () => {
    const result = await useCase.execute(editorId, ProjectId.create('550e8400-e29b-41d4-a716-4466554400aa'), { mainFileNodeId: adocId.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ProjectNotFoundError);
  });

  test('records a success audit entry on set', async () => {
    await useCase.execute(editorId, projectId, { mainFileNodeId: adocId.value });
    const logs = await auditRepo.findByProjectId(projectId);
    expect(logs.some((log) => log.action === 'project.mainFileSet')).toBe(true);
  });
});
