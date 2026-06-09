import { formatRelativeTime } from '@/lib/format-relative-time';

describe('formatRelativeTime', () => {
  const now = new Date('2026-06-08T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  test('very recent timestamps read as "just now"', () => {
    expect(formatRelativeTime(ago(5 * SECOND), now)).toBe('just now');
  });

  test('minutes', () => {
    expect(formatRelativeTime(ago(5 * MINUTE), now)).toBe('5m ago');
  });

  test('hours', () => {
    expect(formatRelativeTime(ago(2 * HOUR), now)).toBe('2h ago');
  });

  test('one day reads as "yesterday"', () => {
    expect(formatRelativeTime(ago(25 * HOUR), now)).toBe('yesterday');
  });

  test('days', () => {
    expect(formatRelativeTime(ago(3 * DAY), now)).toBe('3d ago');
  });

  test('weeks', () => {
    expect(formatRelativeTime(ago(7 * DAY), now)).toBe('1w ago');
  });

  test('months', () => {
    expect(formatRelativeTime(ago(60 * DAY), now)).toBe('2mo ago');
  });

  test('years', () => {
    expect(formatRelativeTime(ago(400 * DAY), now)).toBe('1y ago');
  });
});
