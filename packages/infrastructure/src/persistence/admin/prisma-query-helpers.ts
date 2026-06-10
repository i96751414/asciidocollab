/**
 * Shared Prisma query helpers for the admin list repositories, so the date-range
 * WHERE construction and pagination-skip math live in one place rather than being
 * copy-pasted per repository.
 */

/**
 * Builds an inclusive date-range filter for a `DateTime` column.
 *
 * @param from - Inclusive lower bound, if any.
 * @param to - Inclusive upper bound, if any.
 * @returns A `{ gte?, lte? }` filter, or `undefined` when no bound is set
 *   (so the caller can omit the clause entirely).
 */
export function dateRangeFilter(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return range;
}

/**
 * Computes the row offset for 1-based pagination.
 *
 * @param page - 1-based page number (callers are expected to pass a clamped value).
 * @param limit - Page size.
 */
export function paginationSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
