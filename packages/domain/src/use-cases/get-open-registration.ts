import { UserId } from '../value-objects/user-id';
import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/audit-log-id';
import { SystemSettingRepository } from '../repositories/system-setting.repository';
import { UserRepository } from '../repositories/user.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** Use case for reading the current open-registration system setting. */
export class GetOpenRegistrationUseCase {
  /** Injects the system-setting repository used to read the open-registration flag. */
  constructor(private readonly systemSettingRepo: SystemSettingRepository) {}

  /**
   * Returns whether open registration is currently enabled.
   *
   * @returns An object with an `enabled` boolean.
   */
  async execute(): Promise<{ /** Whether open registration is currently enabled. */
  enabled: boolean }> {
    const value = await this.systemSettingRepo.get('openRegistration');
    return { enabled: value === 'true' };
  }
}

/** Use case for toggling the open-registration system setting. */
export class SetOpenRegistrationUseCase {
  /** Injects the repositories required to update and audit the setting. */
  constructor(
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly userRepo: UserRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Enables or disables open registration.
   *
   * @param actorId - ID of the administrator making the change.
   * @param enabled - The new open-registration state.
   * @returns Success, or a permission error if the actor is not an admin.
   */
  async execute(actorId: UserId, enabled: boolean): Promise<Result<undefined, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    await this.systemSettingRepo.set('openRegistration', enabled ? 'true' : 'false');

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      null,
      'settings.open_registration_changed',
      'SystemSetting',
      'openRegistration',
      new Date(),
      { enabled },
    ));

    return { success: true, value: undefined };
  }
}
