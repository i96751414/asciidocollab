import {
  ProjectRenderConfigRepository,
  UserRepository,
  ProjectRepository,
  ProjectRenderConfig,
  ProjectRenderConfigId,
  ProjectId,
  Project,
} from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaProjectRenderConfigRepository } from '../../../src/persistence/project/prisma-project-render-config.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject } from '../../helpers/test-data';
import { randomUUID } from 'node:crypto';

function makeConfig(projectId: ProjectId, config: Record<string, unknown>): ProjectRenderConfig {
  return new ProjectRenderConfig(ProjectRenderConfigId.create(randomUUID()), projectId, config);
}

describe('PrismaProjectRenderConfigRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: ProjectRenderConfigRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaProjectRenderConfigRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.projectRenderConfig.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  async function setupProject(): Promise<Project> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await projectRepo.save(project);
    return project;
  }

  it('saves and finds a config by project id, round-tripping nested JSON', async () => {
    const project = await setupProject();
    const entity = makeConfig(project.id, {
      doctype: 'book',
      toclevels: 3,
      customAttributes: { company: 'Acme', version: '1.0' },
      extraFontDirs: ['assets/fonts'],
    });
    await repo.save(entity);

    const found = await repo.findByProjectId(project.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(entity.id.value);
    expect(found!.projectId.value).toBe(project.id.value);
    expect(found!.config).toEqual({
      doctype: 'book',
      toclevels: 3,
      customAttributes: { company: 'Acme', version: '1.0' },
      extraFontDirs: ['assets/fonts'],
    });
  });

  it('returns null when no config exists for the project', async () => {
    const project = await setupProject();
    expect(await repo.findByProjectId(project.id)).toBeNull();
  });

  it('returns null for a non-existent project id', async () => {
    const result = await repo.findByProjectId(ProjectId.create('00000000-0000-4000-8000-000000000009'));
    expect(result).toBeNull();
  });

  it('upserts in place, keeping one row per project', async () => {
    const project = await setupProject();
    const first = makeConfig(project.id, { media: 'print' });
    await repo.save(first);
    await repo.save(makeConfig(project.id, { media: 'prepress' }));

    const found = await repo.findByProjectId(project.id);
    expect(found!.config).toEqual({ media: 'prepress' });
    // The unique projectId constraint means the second save updates the same row.
    expect(await client.projectRenderConfig.count({ where: { projectId: project.id.value } })).toBe(1);
  });

  it('persists an empty config', async () => {
    const project = await setupProject();
    await repo.save(makeConfig(project.id, {}));
    const found = await repo.findByProjectId(project.id);
    expect(found!.config).toEqual({});
  });

  it('is removed when its project is deleted (cascade)', async () => {
    const project = await setupProject();
    await repo.save(makeConfig(project.id, { doctype: 'book' }));
    await client.project.delete({ where: { id: project.id.value } });
    expect(await repo.findByProjectId(project.id)).toBeNull();
  });
});
