import {
  ProjectId,
  FileNodeId,
  FileNodeType,
  FilePath,
} from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { PrismaFileNodeRepository } from '../../../src/persistence/file-tree/prisma-file-node.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestFileNode } from '../../helpers/test-data';

// T053a — real Prisma: persist + read Project.mainFileNodeId, and onDelete:SetNull
// clears it when the referenced node is deleted (FR-045/070).
describe('PrismaProjectRepository — main file', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaProjectRepository;
  let fileRepo: PrismaFileNodeRepository;
  let userRepo: PrismaUserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaProjectRepository(client);
    fileRepo = new PrismaFileNodeRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.fileNode.deleteMany();
    await client.projectMember.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  async function seedProjectWithAdoc(): Promise<{ projectId: ProjectId; adocId: FileNodeId }> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await repo.save(project);

    const folder = createTestFileNode(project.id, {
      parentId: null,
      type: FileNodeType.create('folder'),
      name: 'root',
      path: FilePath.create('/root'),
    });
    await fileRepo.save(folder);

    const adoc = createTestFileNode(project.id, {
      parentId: folder.id,
      name: 'main.adoc',
      path: FilePath.create('/root/main.adoc'),
    });
    await fileRepo.save(adoc);

    return { projectId: project.id, adocId: adoc.id };
  }

  it('persists and reads mainFileNodeId', async () => {
    const { projectId, adocId } = await seedProjectWithAdoc();
    const project = await repo.findById(projectId);
    project!.setMainFile(adocId);
    await repo.save(project!);

    const reloaded = await repo.findById(projectId);
    expect(reloaded!.mainFileNodeId?.value).toBe(adocId.value);
  });

  it('clears mainFileNodeId when the referenced node is deleted (onDelete: SetNull)', async () => {
    const { projectId, adocId } = await seedProjectWithAdoc();
    const project = await repo.findById(projectId);
    project!.setMainFile(adocId);
    await repo.save(project!);

    await fileRepo.delete(adocId);

    const reloaded = await repo.findById(projectId);
    expect(reloaded!.mainFileNodeId).toBeNull();
  });

  it('round-trips a null main file (unset)', async () => {
    const { projectId } = await seedProjectWithAdoc();
    const reloaded = await repo.findById(projectId);
    expect(reloaded!.mainFileNodeId).toBeNull();
  });
});
