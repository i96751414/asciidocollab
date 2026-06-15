import { ProjectMember } from '../../entities/project-member';
import { User } from '../../entities/user';
import { AuditLog } from '../../entities/audit-log';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { Email } from '../../value-objects/identity/email';
import { Role } from '../../value-objects/identity/role';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { UserRepository } from '../../ports/user/user.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { UserNotFoundError } from '../../errors/auth/user-not-found';
import { ProjectMemberAlreadyExistsError } from '../../errors/members/project-member-already-exists';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/**
 * Invites a user to a project by email, assigning them a role.
 * Requires the caller to be an owner of the project.
 */
export class InviteUserUseCase {
  /** Creates a new InviteUserUseCase instance. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Invites a user to a project by email, assigning them a role.
   *
   * @param actorId - The owner performing the invitation.
   * @param projectId - The project to invite the user into.
   * @param email - The email of the user to invite.
   * @param role - The role to assign to the invited user.
   * @returns The created `ProjectMember` and the invited `User` on success.
   * On failure returns `PermissionDeniedError` if the caller is not an owner,
   * `UserNotFoundError` if no user is found for the given email, or
   * `ProjectMemberAlreadyExistsError` if the user is already a member.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    email: Email,
    role: Role,
  ): Promise<Result<{ member: ProjectMember; user: User }, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      return { success: false, error: new PermissionDeniedError() };
    }

    const invitedUser = await this.userRepo.findByEmail(email);
    if (!invitedUser) {
      return { success: false, error: new UserNotFoundError(email.value) };
    }

    const existingMember = await this.projectMemberRepo.findByCompositeKey(projectId, invitedUser.id);
    if (existingMember) {
      return { success: false, error: new ProjectMemberAlreadyExistsError(projectId.value, invitedUser.id.value) };
    }

    const member = new ProjectMember(
      projectId,
      invitedUser.id,
      role,
      new Date(),
    );

    await this.projectMemberRepo.addMember(member);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'member.invited',
      'ProjectMember',
      invitedUser.id.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: { member, user: invitedUser } };
  }
}
