import { ProjectMemberRepository, UserRepository, ProjectRepository, Role, Project, User } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaProjectMemberRepository } from '../../../src/persistence/project/prisma-project-member.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestProjectMember } from '../../helpers/test-data';
import { ProjectId, UserId, Email } from '@asciidocollab/domain';

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

    const newRole = Role.create('owner');
    await repo.updateRole(project.id, user.id, newRole);

    const found = await repo.findByCompositeKey(project.id, user.id);
    expect(found).not.toBeNull();
    expect(found!.role.value).toBe('owner');
  });

  it('findSoleOwnerProjects returns only projects where the user is the lone owner', async () => {
    const soleOwner = createTestUser({ email: Email.create('soleowner@example.com') });
    const coOwner = createTestUser({ email: Email.create('coowner@example.com') });
    await userRepo.save(soleOwner);
    await userRepo.save(coOwner);

    const soloProject = createTestProject();
    const sharedProject = createTestProject();
    await projectRepo.save(soloProject);
    await projectRepo.save(sharedProject);

    // soleOwner is the only owner of soloProject.
    await repo.addMember(createTestProjectMember(soloProject.id, soleOwner.id, { role: Role.create('owner') }));
    // sharedProject has two owners → not sole.
    await repo.addMember(createTestProjectMember(sharedProject.id, soleOwner.id, { role: Role.create('owner') }));
    await repo.addMember(createTestProjectMember(sharedProject.id, coOwner.id, { role: Role.create('owner') }));

    const sole = await repo.findSoleOwnerProjects(soleOwner.id);
    const ids = sole.map((p) => p.id.value);
    expect(ids).toContain(soloProject.id.value);
    expect(ids).not.toContain(sharedProject.id.value);
  });

  async function setupProjectAndUser(): Promise<{ project: Project; user: User }> {
    const user = createTestUser();
    await userRepo.save(user);
    const project = createTestProject();
    await projectRepo.save(project);
    return { project, user };
  }
});
