import { ProjectMemberRepository, UserRepository, ProjectRepository, Role, Project, User } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaProjectMemberRepository } from '../../src/persistence/prisma-project-member.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestProjectMember } from '../helpers/test-data';
import { ProjectId, UserId } from '@asciidocollab/domain';

describe('PrismaProjectMemberRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: ProjectMemberRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaProjectMemberRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.projectMember.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should add and find members by project id', async () => {
    const { project, user } = await setupProjectAndUser();
    const member = createTestProjectMember(project.id, user.id);
    await repo.addMember(member);

    const members = await repo.findByProjectId(project.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId.value).toBe(user.id.value);
  });

  it('should find members by user id', async () => {
    const { project, user } = await setupProjectAndUser();
    const member = createTestProjectMember(project.id, user.id);
    await repo.addMember(member);

    const memberships = await repo.findByUserId(user.id);
    expect(memberships).toHaveLength(1);
  });

  it('should find member by composite key', async () => {
    const { project, user } = await setupProjectAndUser();
    const member = createTestProjectMember(project.id, user.id);
    await repo.addMember(member);

    const found = await repo.findByCompositeKey(project.id, user.id);
    expect(found).not.toBeNull();
    expect(found!.role.value).toBe('viewer');
  });

  it('should return null for non-existent composite key', async () => {
    const result = await repo.findByCompositeKey(
      ProjectId.create('00000000-0000-4000-8000-000000000001'),
      UserId.create('00000000-0000-4000-8000-000000000002'),
    );
    expect(result).toBeNull();
  });

  it('should remove a member', async () => {
    const { project, user } = await setupProjectAndUser();
    const member = createTestProjectMember(project.id, user.id);
    await repo.addMember(member);
    await repo.removeMember(project.id, user.id);

    const found = await repo.findByCompositeKey(project.id, user.id);
    expect(found).toBeNull();
  });

  it('should update a member role', async () => {
    const { project, user } = await setupProjectAndUser();
    const member = createTestProjectMember(project.id, user.id);
    await repo.addMember(member);

    const newRole = Role.create('administrator');
    await repo.updateRole(project.id, user.id, newRole);

    const found = await repo.findByCompositeKey(project.id, user.id);
    expect(found).not.toBeNull();
    expect(found!.role.value).toBe('administrator');
  });

  async function setupProjectAndUser(): Promise<{ project: Project; user: User }> {
    const user = createTestUser();
    await userRepo.save(user);
    const project = createTestProject(user.id);
    await projectRepo.save(project);
    return { project, user };
  }
});
