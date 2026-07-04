import { UserId } from '../../value-objects/ids/user-id';
import { AuthAttemptTelemetry, AUTH_ATTEMPT_FAILED_SIGN_IN } from '../../entities/auth-attempt-telemetry';
import {
  AuthAttemptTelemetryRepository,
  AuthAttemptTelemetryFilters,
} from '../../ports/admin/auth-attempt-telemetry.repository';
import { PaginationOptions, PagedResult } from '../../ports/admin/audit-log.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { isAdmin, normalizeAdminPagination } from './admin-list-helpers';

/**
 * Retrieves a paged, filtered view of failed-sign-in telemetry for admins only
 * so credential-stuffing / brute-force patterns are reconstructable.
 * Mirrors {@link ListAuditLogsUseCase}'s admin-gating, but reads the separate
 * telemetry store.
 */
export class ListFailedSignInAttemptsUseCase {
  /**
   * @param repo - Failed-sign-in telemetry repository.
   * @param userRepo - Used to verify the requester is an admin.
   */
  constructor(
    private readonly repo: AuthAttemptTelemetryRepository,
    private readonly userRepo: UserRepository,
  ) {}

  /**
   * Validates admin privileges then fetches a filtered page of telemetry.
   *
   * @param actorId - ID of the requesting user.
   * @param filters - Identifier, origin, and time-range filters.
   * @param pagination - Page and limit options.
   * @returns A paged result, or a `PermissionDeniedError` for non-admins.
   */
  async execute(
    actorId: UserId,
    filters: AuthAttemptTelemetryFilters,
    pagination: PaginationOptions,
  ): Promise<Result<PagedResult<AuthAttemptTelemetry>, DomainError>> {
    if (!(await isAdmin(this.userRepo, actorId))) {
      return { success: false, error: new PermissionDeniedError() };
    }

    // Pin the event type so the failed-sign-in review never includes other
    // account-security telemetry (e.g. password-reset requests) sharing the store.
    const result = await this.repo.findWithFilters(
      { ...filters, eventType: AUTH_ATTEMPT_FAILED_SIGN_IN },
      normalizeAdminPagination(pagination),
    );
    return { success: true, value: result };
  }
}
