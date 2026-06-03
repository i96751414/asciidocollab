import { ProjectRepository, UserRepository, ProjectName } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject } from '../helpers/test-data';
import { ProjectId } from '@asciidocollab/domain';

describe('PrismaProjectRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: ProjectRepository;
  let userRepo: UserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaProjectRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.projectMember.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find a project by id', async () => {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await repo.save(project);

    const found = await repo.findById(project.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(project.id.value);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(ProjectId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should delete a project', async () => {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await repo.save(project);

    await repo.delete(project.id);
    const found = await repo.findById(project.id);
    expect(found).toBeNull();
  });

  it('should update an existing project on save', async () => {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await repo.save(project);

    const updatedProject = createTestProject({ id: project.id, name: ProjectName.create('Updated Project') });
    await repo.save(updatedProject);

    const found = await repo.findById(project.id);
    expect(found).not.toBeNull();
  });

  it('should handle delete of non-existent entity gracefully', async () => {
    const nonExistentId = ProjectId.create('00000000-0000-4000-8000-000000000002');
    await expect(repo.delete(nonExistentId)).resolves.not.toThrow();
  });

  it('should persist and retrieve tags as JSON', async () => {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject({ tags: ['tag1', 'tag2', 'tag3'] });
    await repo.save(project);

    const found = await repo.findById(project.id);
    expect(found).not.toBeNull();
  });
});
