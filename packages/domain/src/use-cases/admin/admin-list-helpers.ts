import { PaginationOptions } from '../../ports/admin/audit-log.repository';
import { UserRepository } from '../../ports/user/user.repository';
import { UserId } from '../../value-objects/ids/user-id';

/** Default page size for admin list endpoints. */
export const ADMIN_LIST_DEFAULT_LIMIT = 50;
/** Maximum page size an admin list endpoint will honour. */
export const ADMIN_LIST_MAX_LIMIT = 200;

/**
 * Normalizes (and clamps) pagination for admin list use cases.
 *
 * Guarantees `page >= 1` and `1 <= limit <= ADMIN_LIST_MAX_LIMIT`, so a
 * non-positive page can never produce a negative repository `skip` (which the
 * persistence layer would reject) and a zero/negative limit can never silently
 * return an empty page.
 *
 * @param pagination - The requested page/limit (either may be missing).
 * @returns Clamped, safe pagination options.
 */
export function normalizeAdminPagination(pagination: PaginationOptions): PaginationOptions {
  const page = Math.max(1, Math.trunc(pagination.page ?? 1));
  const requested = Math.trunc(pagination.limit ?? ADMIN_LIST_DEFAULT_LIMIT);
  const limit = Math.min(Math.max(1, requested), ADMIN_LIST_MAX_LIMIT);
  return { page, limit };
}

/**
 * Returns true when the actor is an existing admin user.
 *
 * @param userRepo - Repository used to resolve the actor.
 * @param actorId - The requesting user's id.
 */
export async function isAdmin(userRepo: UserRepository, actorId: UserId): Promise<boolean> {
  const actor = await userRepo.findById(actorId);
  return actor?.isAdmin ?? false;
}
