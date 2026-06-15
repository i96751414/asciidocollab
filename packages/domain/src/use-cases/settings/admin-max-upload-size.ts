import { UserId } from '../../value-objects/ids/user-id';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { SystemSettingRepository } from '../../ports/admin/system-setting.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../constants';
import { randomUUID } from 'crypto';

/** Returns the current admin-configurable max upload size in bytes. */
export class GetMaxUploadSizeUseCase {
  /** Initializes the use case with the system setting repository and the hard-coded default limit. */
  constructor(
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly defaultMaxUploadSizeBytes: number,
  ) {}

  /** Returns the effective max upload size, using the stored setting if present or the default otherwise. */
  async execute(): Promise<{ maxUploadSizeBytes: number }> {
    const stored = await this.systemSettingRepo.get(SETTING_MAX_UPLOAD_SIZE_BYTES);
    const maxUploadSizeBytes = stored === null ? this.defaultMaxUploadSizeBytes : Number(stored);
    return { maxUploadSizeBytes };
  }
}

/** Persists a new admin-configurable max upload size. Only admins may call this. */
export class SetMaxUploadSizeUseCase {
  /** Initializes the use case with the repositories required to persist the setting and record an audit log entry. */
  constructor(
    private readonly systemSettingRepo: SystemSettingRepository,
    private readonly userRepo: UserRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /** Validates that the actor is an admin, then saves the new limit and records an audit log entry. */
  async execute(actorId: UserId, maxUploadSizeBytes: number): Promise<Result<undefined, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    await this.systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, String(maxUploadSizeBytes));

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      null,
      'settings.max_upload_size_changed',
      'SystemSetting',
      SETTING_MAX_UPLOAD_SIZE_BYTES,
      new Date(),
      { maxUploadSizeBytes },
    ));

    return { success: true, value: undefined };
  }
}
