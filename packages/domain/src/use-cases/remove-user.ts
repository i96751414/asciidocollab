import { ProjectMember } from '../entities/project-member';
import { Role } from '../value-objects/role';
import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/audit-log-id';
import { UserId } from '../value-objects/user-id';
import { UserRepository } from '../repositories/user.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { SessionRepository } from '../repositories/session.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { CannotRemoveSelfError } from '../errors/cannot-remove-self';
import { CannotRemoveLastAdminError } from '../errors/cannot-remove-last-admin';
import { UserNotFoundError } from '../errors/user-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** Result returned after successfully removing a user. */
export interface RemoveUserResult {
  /** IDs of projects that were transferred to the acting admin. */
  projectIdsTransferred: string[];
}

/** Use case for permanently removing a user account, transferring sole-owner projects. */
export class RemoveUserUseCase {
  /** Injects the repositories required to remove a user and its associated data. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Removes the target user and transfers their sole-owner projects to the actor.
   *
   * @param actorId - ID of the administrator performing the removal.
   * @param targetId - ID of the user to remove.
   * @returns Success with transferred project IDs, or an appropriate domain error.
   */
  async execute(actorId: UserId, targetId: UserId): Promise<Result<RemoveUserResult, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (actorId.value === targetId.value) {
      return { success: false, error: new CannotRemoveSelfError() };
    }

    const target = await this.userRepo.findById(targetId);
    if (!target) {
      return { success: false, error: new UserNotFoundError(targetId.value) };
    }

    if (target.isAdmin) {
      const adminCount = await this.userRepo.countAdmins();
      if (adminCount <= 1) {
        return { success: false, error: new CannotRemoveLastAdminError() };
      }
    }

    // Transfer sole-owner projects to actor
    const soleOwnerProjects = await this.projectMemberRepo.findSoleOwnerProjects(targetId);
    const projectIdsTransferred: string[] = [];

    for (const project of soleOwnerProjects) {
      const actorMembership = await this.projectMemberRepo.findByCompositeKey(project.id, actorId);
      await (actorMembership ? this.projectMemberRepo.updateRole(project.id, actorId, Role.create('owner')) : this.projectMemberRepo.addMember(
          new ProjectMember(project.id, actorId, Role.create('owner'), new Date()),
        ));
      projectIdsTransferred.push(project.id.value);
    }

    // Delete all sessions before hard-deleting the user
    await this.sessionRepo.deleteByUserId(targetId);

    // Hard delete (cascades memberships, verification tokens, etc.)
    await this.userRepo.delete(targetId);

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      null,
      'user.removed',
      'User',
      targetId.value,
      new Date(),
      { projectIdsTransferred },
    ));

    return { success: true, value: { projectIdsTransferred } };
  }
}
