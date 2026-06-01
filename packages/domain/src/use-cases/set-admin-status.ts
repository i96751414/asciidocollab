import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/audit-log-id';
import { UserRepository } from '../repositories/user.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { SessionRepository } from '../repositories/session.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { CannotModifySelfAdminError } from '../errors/cannot-modify-self-admin';
import { CannotRemoveLastAdminError } from '../errors/cannot-remove-last-admin';
import { UserNotFoundError } from '../errors/user-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** Use case for granting or revoking administrator privileges on a user account. */
export class SetAdminStatusUseCase {
  /** Injects the repositories required to update admin status and audit the change. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly sessionRepo: SessionRepository,
  ) {}

  /**
   * Grants or revokes admin status for the target user.
   *
   * @param actorId - ID of the administrator making the change.
   * @param targetId - ID of the user whose admin status is being changed.
   * @param newIsAdmin - The new admin flag value.
   * @returns Success, or an appropriate domain error.
   */
  async execute(
    actorId: UserId,
    targetId: UserId,
    newIsAdmin: boolean,
  ): Promise<Result<undefined, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (actorId.value === targetId.value) {
      return { success: false, error: new CannotModifySelfAdminError() };
    }

    const target = await this.userRepo.findById(targetId);
    if (!target) {
      return { success: false, error: new UserNotFoundError(targetId.value) };
    }

    if (target.isAdmin && !newIsAdmin) {
      const adminCount = await this.userRepo.countAdmins();
      if (adminCount <= 1) {
        return { success: false, error: new CannotRemoveLastAdminError() };
      }
    }

    const updated = new User(
      target.id,
      target.email,
      target.displayName,
      target.passwordHash,
      target.passwordHistory,
      target.samlSubject,
      target.mfaSecret,
      newIsAdmin,
      target.timestamps,
      target.emailVerified,
      target.registrationMethod,
    );
    await this.userRepo.save(updated);

    if (!newIsAdmin) {
      await this.sessionRepo.deleteByUserId(targetId);
    }

    const action = newIsAdmin ? 'user.admin_granted' : 'user.admin_revoked';
    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      null,
      action,
      'User',
      targetId.value,
    ));

    return { success: true, value: undefined };
  }
}
