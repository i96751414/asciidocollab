import { FileNodeRepository, UserRepository, ProjectRepository, FileNodeType, FilePath, Project } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaFileNodeRepository } from '../../src/persistence/prisma-file-node.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestFileNode } from '../helpers/test-data';
import { FileNodeId } from '@asciidocollab/domain';

describe('PrismaFileNodeRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: FileNodeRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaFileNodeRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.document.deleteMany();
    await client.fileNode.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find a file node by id', async () => {
    const { project } = await setupProject();
    const node = createTestFileNode(project.id, { type: FileNodeType.create('folder'), path: createPath('/root') });
    await repo.save(node);

    const found = await repo.findById(node.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(node.id.value);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(FileNodeId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should find nodes by parent id', async () => {
    const { project } = await setupProject();
    const folder = createTestFileNode(project.id, { name: 'folder', type: FileNodeType.create('folder'), path: createPath('/folder') });
    await repo.save(folder);

    const child = createTestFileNode(project.id, { parentId: folder.id, name: 'child.adoc', path: createPath('/folder/child.adoc') });
    await repo.save(child);

    const children = await repo.findByParentId(folder.id);
    expect(children).toHaveLength(1);
    expect(children[0].id.value).toBe(child.id.value);
  });

  it('should find nodes by project id', async () => {
    const { project } = await setupProject();
    const node1 = createTestFileNode(project.id, { type: FileNodeType.create('folder'), path: createPath('/folder1') });
    const node2 = createTestFileNode(project.id, { type: FileNodeType.create('folder'), path: createPath('/folder2') });
    await repo.save(node1);
    await repo.save(node2);

    const nodes = await repo.findByProjectId(project.id);
    expect(nodes).toHaveLength(2);
  });

  it('should move a node to a new parent', async () => {
    const { project } = await setupProject();
    const folder1 = createTestFileNode(project.id, { name: 'folder1', type: FileNodeType.create('folder'), path: createPath('/folder1') });
    const folder2 = createTestFileNode(project.id, { name: 'folder2', type: FileNodeType.create('folder'), path: createPath('/folder2') });
    await repo.save(folder1);
    await repo.save(folder2);

    const child = createTestFileNode(project.id, { parentId: folder1.id, name: 'doc.adoc', path: createPath('/folder1/doc.adoc') });
    await repo.save(child);

    await repo.move(child.id, folder2.id);
    const found = await repo.findById(child.id);
    expect(found).not.toBeNull();
    expect(found!.parentId!.value).toBe(folder2.id.value);
  });

  it('should delete a file node', async () => {
    const { project } = await setupProject();
    const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), name: 'todelete', path: createPath('/todelete') });
    await repo.save(folder);
    await repo.delete(folder.id);
    const found = await repo.findById(folder.id);
    expect(found).toBeNull();
  });

  it('should handle delete of non-existent node', async () => {
    const id = FileNodeId.create('00000000-0000-4000-8000-000000000002');
    await expect(repo.delete(id)).resolves.not.toThrow();
  });

  async function setupProject(): Promise<{ project: Project }> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject(owner.id);
    await projectRepo.save(project);
    return { project };
  }
});

function createPath(value: string): FilePath {
  return FilePath.create(value);
}
