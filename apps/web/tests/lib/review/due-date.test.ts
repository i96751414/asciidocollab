import { classifyDueDate, dueDateTextClass, formatDueDate, DUE_DATE_TITLE } from '@/lib/review/due-date';

describe('classifyDueDate', () => {
  // A fixed "today" so the classification is deterministic regardless of when the suite runs.
  const today = new Date(2026, 6, 11); // 2026-07-11 (month is 0-based)

  test('a date before today is overdue', () => {
    expect(classifyDueDate('2026-07-10', today)).toBe('overdue');
    expect(classifyDueDate('2025-12-31', today)).toBe('overdue');
  });

  test('the current day is "today", including a later time on the same day', () => {
    expect(classifyDueDate('2026-07-11', today)).toBe('today');
    expect(classifyDueDate('2026-07-11T23:59:59.000Z', today)).toBe('today');
  });

  test('a future date is upcoming', () => {
    expect(classifyDueDate('2026-07-12', today)).toBe('upcoming');
    expect(classifyDueDate('2027-01-01', today)).toBe('upcoming');
  });

  test('compares whole calendar days, not raw timestamps', () => {
    // Early on 2026-07-11 relative to a "today" set to midnight still reads as today, not overdue.
    expect(classifyDueDate('2026-07-11T00:00:01.000Z', today)).toBe('today');
  });

  test('a non-ISO but parseable value falls back to its local calendar day', () => {
    // These do not start with YYYY-MM-DD, so they exercise the Date-parse fallback path.
    expect(classifyDueDate('July 10, 2026', today)).toBe('overdue');
    expect(classifyDueDate('July 12, 2026', today)).toBe('upcoming');
  });

  test('an unparseable value returns null', () => {
    expect(classifyDueDate('not-a-date', today)).toBeNull();
    expect(classifyDueDate('', today)).toBeNull();
  });

  test('defaults to the real current date when no reference is given', () => {
    // Without a reference, a far-future date must still be upcoming and a far-past date overdue.
    expect(classifyDueDate('2999-01-01')).toBe('upcoming');
    expect(classifyDueDate('1999-01-01')).toBe('overdue');
  });
});

describe('dueDateTextClass', () => {
  test('returns the base emphasis class per urgency', () => {
    expect(dueDateTextClass('overdue')).toBe('text-destructive');
    expect(dueDateTextClass('today')).toContain('text-amber-600');
    expect(dueDateTextClass('upcoming')).toBe('text-muted-foreground');
  });

  test('appends the hover variant when requested', () => {
    expect(dueDateTextClass('overdue', true)).toBe('text-destructive hover:text-destructive');
    expect(dueDateTextClass('today', true)).toContain('hover:text-amber-600');
    expect(dueDateTextClass('upcoming', true)).toContain('hover:text-foreground');
  });
});

describe('DUE_DATE_TITLE', () => {
  test('labels each urgency', () => {
    expect(DUE_DATE_TITLE).toEqual({ overdue: 'Overdue', today: 'Due today', upcoming: 'Due date' });
  });
});

describe('formatDueDate', () => {
  test('formats a YYYY-MM-DD value on its own local calendar day', () => {
    // A local parse (not UTC midnight), so the day never drifts backwards west of UTC.
    expect(formatDueDate('2026-07-10')).toBe(
      new Date(2026, 6, 10).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    );
  });

  test('falls back to a full ISO timestamp via Date parsing', () => {
    expect(formatDueDate('2026-07-10T08:00:00.000Z')).toMatch(/2026/);
  });

  test('returns the raw value when unparseable', () => {
    expect(formatDueDate('whenever')).toBe('whenever');
  });
});
