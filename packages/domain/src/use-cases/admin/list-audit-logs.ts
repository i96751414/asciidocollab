import { UserId } from '../../value-objects/user-id';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogRepository, AuditLogFilters, PaginationOptions, PagedResult } from '../../ports/admin/audit-log.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Retrieves a paged and filtered list of audit logs for admin users only. */
export class ListAuditLogsUseCase {
  /**
   * @param auditLogRepo - Provides paginated audit-log retrieval.
   * @param userRepo - Used to verify admin status of the requesting user.
   */
  constructor(
    private readonly auditLogRepo: AuditLogRepository,
    private readonly userRepo: UserRepository,
  ) {}

  /**
   * Validates admin privileges then fetches a filtered page of audit logs.
   *
   * @param actorId - ID of the user making the request.
   * @param filters - Date, user, and action-type filters.
   * @param pagination - Page and limit options.
   * @returns A paged result or a `PermissionDeniedError` for non-admins.
   */
  async execute(
    actorId: UserId,
    filters: AuditLogFilters,
    pagination: PaginationOptions,
  ): Promise<Result<PagedResult<AuditLog>, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const limit = Math.min(pagination.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = pagination.page ?? 1;

    const result = await this.auditLogRepo.findWithFilters(filters, { page, limit });
    return { success: true, value: result };
  }
}
