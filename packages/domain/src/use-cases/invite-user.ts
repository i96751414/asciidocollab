import { ProjectMember } from '../entities/project-member';
import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { Email } from '../value-objects/email';
import { Role } from '../value-objects/role';
import { AuditLogId } from '../value-objects/audit-log-id';
import { UserRepository } from '../repositories/user.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { UserNotFoundError } from '../errors/user-not-found';
import { ProjectMemberAlreadyExistsError } from '../errors/project-member-already-exists';
import { DomainError } from '../errors/domain-error';
import { Result } from '@asciidocollab/shared';
import { randomUUID } from 'crypto';

/**
 * Invites a user to a project by email, assigning them a role.
 * Requires the caller to be an administrator of the project.
 */
export class InviteUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * @param callerId - The administrator performing the invitation.
   * @param projectId - The project to invite the user into.
   * @param email - The email of the user to invite.
   * @param role - The role to assign to the invited user.
   * @returns void on success.
   * @throws PermissionDeniedError if the caller is not an administrator.
   * @throws UserNotFoundError if no user is found for the given email.
   * @throws ProjectMemberAlreadyExistsError if the user is already a member.
   */
  async execute(
    callerId: UserId,
    projectId: ProjectId,
    email: Email,
    role: Role,
  ): Promise<Result<void, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, callerId);
    if (!callerMembership || callerMembership.role.value !== 'administrator') {
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
      callerId,
      projectId,
      'member.invited',
      'ProjectMember',
      invitedUser.id.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }
}
