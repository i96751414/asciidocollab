import { ListUserProjectsUseCase } from '../../../src/use-cases/project/list-user-projects';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ProjectName } from '../../../src/value-objects/project/project-name';

describe('ListUserProjectsUseCase', () => {
  let useCase: ListUserProjectsUseCase;
  let projectRepo: InMemoryProjectRepository;

  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const memberId = UserId.create('550e8400-e29b-41d4-a716-446655440010');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440002');

  beforeEach(() => {
    projectRepo = new InMemoryProjectRepository();
    useCase = new ListUserProjectsUseCase(projectRepo);
  });

  test('returns empty list when user has no projects', async () => {
    expect.assertions(3);
    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toEqual([]);
      expect(result.value.total).toBe(0);
    }
  });

  test('returns projects where user is a member', async () => {
    expect.assertions(3);
    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(project);
    projectRepo.addMembership(projectId, userId);

    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(1);
      expect(result.value.projects[0].id).toBe(projectId);
    }
  });

  test('returns projects where user is a member (not owner)', async () => {
    expect.assertions(3);
    const project = new Project(
      projectId,
      ProjectName.create('Member Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(project);
    projectRepo.addMembership(projectId, memberId);

    const result = await useCase.execute(memberId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(1);
      expect(result.value.projects[0].id).toBe(projectId);
    }
  });

  test('uses default pagination when none provided', async () => {
    expect.assertions(2);
    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(project);
    projectRepo.addMembership(projectId, userId);

    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.limit).toBe(20);
    }
  });

  test('paginates results correctly', async () => {
    expect.assertions(5);
    for (let index = 0; index < 5; index++) {
      const id = ProjectId.create(`550e8400-e29b-41d4-a716-44665544000${index}`);
      const project = new Project(
        id,
        ProjectName.create(`Project ${index}`),
        null,
        [],
        null,
      );
      await projectRepo.save(project);
      projectRepo.addMembership(id, userId);
    }

    const result = await useCase.execute(userId, { page: 1, limit: 2 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(2);
      expect(result.value.total).toBe(5);
      expect(result.value.totalPages).toBe(3);
      expect(result.value.page).toBe(1);
    }
  });

  test('returns empty page when page exceeds total pages', async () => {
    expect.assertions(3);
    const project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(project);
    projectRepo.addMembership(projectId, userId);

    const result = await useCase.execute(userId, { page: 100, limit: 10 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(0);
      expect(result.value.total).toBe(1);
    }
  });

  test('excludes archived projects by default', async () => {
    expect.assertions(2);
    const activeProject = new Project(
      projectId,
      ProjectName.create('Active Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(activeProject);
    projectRepo.addMembership(projectId, userId);

    const archivedId = ProjectId.create('550e8400-e29b-41d4-a716-446655440003');
    const archivedProject = new Project(
      archivedId,
      ProjectName.create('Archived Project'),
      null,
      [],
      null,
    );
    archivedProject.archive();
    await projectRepo.save(archivedProject);
    projectRepo.addMembership(archivedId, userId);

    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(1);
    }
  });

  test('returns only archived projects when archivedOnly=true', async () => {
    expect.assertions(3);
    const activeProject = new Project(
      projectId,
      ProjectName.create('Active Project'),
      null,
      [],
      null,
    );
    await projectRepo.save(activeProject);
    projectRepo.addMembership(projectId, userId);

    const archivedId = ProjectId.create('550e8400-e29b-41d4-a716-446655440003');
    const archivedProject = new Project(
      archivedId,
      ProjectName.create('Archived Project'),
      null,
      [],
      null,
    );
    archivedProject.archive();
    await projectRepo.save(archivedProject);
    projectRepo.addMembership(archivedId, userId);

    const result = await useCase.execute(userId, { page: 1, limit: 20 }, true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.projects).toHaveLength(1);
      expect(result.value.projects[0].id.value).toBe('550e8400-e29b-41d4-a716-446655440003');
    }
  });
});
