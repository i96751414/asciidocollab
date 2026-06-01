import { ImageRepository, UserRepository, ProjectRepository, ImageId, Project } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaImageRepository } from '../../src/persistence/prisma-image.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestImage } from '../helpers/test-data';

describe('PrismaImageRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: ImageRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaImageRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.image.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find an image by id', async () => {
    const project = await setupProject();
    const image = createTestImage(project.id);
    await repo.save(image);

    const found = await repo.findById(image.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(image.id.value);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(ImageId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should find images by project id', async () => {
    const project = await setupProject();
    const img1 = createTestImage(project.id, { filename: 'img1.png' });
    const img2 = createTestImage(project.id, { filename: 'img2.png' });
    await repo.save(img1);
    await repo.save(img2);

    const images = await repo.findByProjectId(project.id);
    expect(images).toHaveLength(2);
  });

  it('should delete an image', async () => {
    const project = await setupProject();
    const image = createTestImage(project.id);
    await repo.save(image);
    await repo.delete(image.id);
    const found = await repo.findById(image.id);
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
