import { dateRangeFilter, paginationSkip } from '../../../src/persistence/admin/prisma-query-helpers';

/**
 * Unit tests for the shared admin-list Prisma query helpers. These are pure functions (no Prisma
 * client), so they are exercised directly rather than through a repository + test container.
 */

describe('dateRangeFilter', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');
  const to = new Date('2026-02-01T00:00:00.000Z');

  it('returns undefined when neither bound is set (clause omitted entirely)', () => {
    expect(dateRangeFilter()).toBeUndefined();
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it('returns only a lower bound when just `from` is set', () => {
    expect(dateRangeFilter(from)).toEqual({ gte: from });
  });

  it('returns only an upper bound when just `to` is set', () => {
    expect(dateRangeFilter(undefined, to)).toEqual({ lte: to });
  });

  it('returns both bounds when both are set', () => {
    expect(dateRangeFilter(from, to)).toEqual({ gte: from, lte: to });
  });
});

describe('paginationSkip', () => {
  it('computes a zero offset for the first page', () => {
    expect(paginationSkip(1, 20)).toBe(0);
  });

  it('computes the row offset for a later page', () => {
    expect(paginationSkip(3, 20)).toBe(40);
  });
});
