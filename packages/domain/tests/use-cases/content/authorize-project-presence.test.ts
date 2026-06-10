import { AuthorizeProjectPresenceUseCase } from '../../../src/use-cases/content/authorize-project-presence';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { Role } from '../../../src/value-objects/role';

describe('AuthorizeProjectPresenceUseCase', () => {
  const memberId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');

  let projectMemberRepo: InMemoryProjectMemberRepository;
  let useCase: AuthorizeProjectPresenceUseCase;

  beforeEach(async () => {
    projectMemberRepo = new InMemoryProjectMemberRepository();
    useCase = new AuthorizeProjectPresenceUseCase(projectMemberRepo);
    await projectMemberRepo.addMember(new ProjectMember(projectId, memberId, Role.create('viewer')));
  });

  it('authorizes a project member (any role)', async () => {
    const result = await useCase.execute(memberId, projectId);
    expect(result.success).toBe(true);
  });

  it('denies a non-member with reason not_a_member', async () => {
    const result = await useCase.execute(nonMemberId, projectId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.reason).toBe('not_a_member');
    }
  });
});
