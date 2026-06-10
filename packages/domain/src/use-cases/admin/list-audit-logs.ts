import { UserId } from '../../value-objects/user-id';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogRepository, AuditLogFilters, PaginationOptions, PagedResult } from '../../ports/admin/audit-log.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { isAdmin, normalizeAdminPagination } from './admin-list-helpers';

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
    if (!(await isAdmin(this.userRepo, actorId))) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const result = await this.auditLogRepo.findWithFilters(filters, normalizeAdminPagination(pagination));
    return { success: true, value: result };
  }
}
