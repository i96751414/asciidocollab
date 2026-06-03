import { AssetRepository, UserRepository, ProjectRepository, AssetId, Project } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaAssetRepository } from '../../../src/persistence/file-tree/prisma-asset.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestAsset } from '../../helpers/test-data';

describe('PrismaAssetRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: AssetRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaAssetRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.asset.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find an asset by id', async () => {
    const project = await setupProject();
    const asset = createTestAsset(project.id);
    await repo.save(asset);

    const found = await repo.findById(asset.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(asset.id.value);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(AssetId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should find assets by project id', async () => {
    const project = await setupProject();
    const asset1 = createTestAsset(project.id, { filename: 'asset1.png' });
    const asset2 = createTestAsset(project.id, { filename: 'asset2.png' });
    await repo.save(asset1);
    await repo.save(asset2);

    const assets = await repo.findByProjectId(project.id);
    expect(assets).toHaveLength(2);
  });

  it('should delete an asset', async () => {
    const project = await setupProject();
    const asset = createTestAsset(project.id);
    await repo.save(asset);
    await repo.delete(asset.id);
    const found = await repo.findById(asset.id);
    expect(found).toBeNull();
  });

  async function setupProject(): Promise<Project> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await projectRepo.save(project);
    return project;
  }
});
