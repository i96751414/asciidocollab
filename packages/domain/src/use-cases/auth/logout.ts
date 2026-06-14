import { UserId } from '../../value-objects/ids/user-id';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { RequestContext } from '../../types/request-context';
import { withOrigin } from '../audit-metadata';
import { AUDIT_AUTH_SIGNED_OUT } from '../../audit-actions';
import { randomUUID } from 'crypto';

/**
 * Records a user sign-out (`auth.signed_out`). Session teardown is a delivery
 * concern handled by the route; this use case owns the audit record so all
 * audit logging stays in the domain.
 */
export class LogoutUseCase {
  /**
   * @param auditLogRepo - Repository for the sign-out governance record.
   */
  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  /**
   * Records the sign-out for the given actor.
   *
   * @param actorId - The user signing out.
   * @param context - Request origin, captured into the audit metadata.
   */
  async execute(actorId: UserId, context?: RequestContext): Promise<void> {
    await this.auditLogRepo.save(
      new AuditLog(
        AuditLogId.create(randomUUID()),
        actorId,
        null,
        AUDIT_AUTH_SIGNED_OUT,
        'User',
        actorId.value,
        new Date(),
        withOrigin({}, context),
      ),
    );
  }
}
