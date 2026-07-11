/**
 * Pure due-date classification shared by the task rail and the project task panel. A due date on its
 * own tells the reader nothing about urgency, so the UI needs to distinguish a date that has already
 * passed, one that falls on the current day, and one still ahead. Kept free of React so both the
 * inline task controls and the panel row can derive the same emphasis from one tested rule.
 */

/** Where a task's due date falls relative to today. */
export type DueDateStatus = 'overdue' | 'today' | 'upcoming';

/** Formats a Date as a local `YYYY-MM-DD` day key (no time, no timezone shift). */
function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Classifies a due date relative to `today`, comparing whole calendar days so a task due later today
 * still reads as "today" rather than "overdue". Due dates are stored as `YYYY-MM-DD`; that leading
 * day part is compared directly (lexicographic order matches chronological order for this format) to
 * avoid the timezone drift a `new Date('YYYY-MM-DD')` UTC-midnight parse would introduce. A full ISO
 * timestamp falls back to its local calendar day. Returns null for an unparseable value.
 */
export function classifyDueDate(iso: string, today: Date = new Date()): DueDateStatus | null {
  const dayMatch = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  let dueDay: string;
  if (dayMatch) {
    dueDay = dayMatch[0];
  } else {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    dueDay = localDayKey(parsed);
  }
  const todayDay = localDayKey(today);
  if (dueDay < todayDay) return 'overdue';
  if (dueDay === todayDay) return 'today';
  return 'upcoming';
}

/** Base text-emphasis class per urgency (overdue → destructive, today → amber, upcoming → muted). */
const DUE_DATE_BASE_CLASS: Record<DueDateStatus, string> = {
  overdue: 'text-destructive',
  today: 'text-amber-600 dark:text-amber-400',
  upcoming: 'text-muted-foreground',
};

/** The `hover:`-prefixed variant, so a control whose parent restyles text on hover keeps its urgency color. */
const DUE_DATE_HOVER_CLASS: Record<DueDateStatus, string> = {
  overdue: 'hover:text-destructive',
  today: 'hover:text-amber-600 dark:hover:text-amber-400',
  upcoming: 'hover:text-foreground',
};

/** Tooltip text per urgency for the due-date control. */
export const DUE_DATE_TITLE: Record<DueDateStatus, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Due date',
};

/**
 * The text-emphasis class(es) for a due-date's urgency. Pass `withHover` for interactive controls
 * (the inline task-date picker) so the urgency color survives the parent's hover restyle; omit it for
 * static rows (the task-panel row label).
 */
export function dueDateTextClass(status: DueDateStatus, withHover = false): string {
  return withHover ? `${DUE_DATE_BASE_CLASS[status]} ${DUE_DATE_HOVER_CLASS[status]}` : DUE_DATE_BASE_CLASS[status];
}

/**
 * Formats a due date for compact display, falling back to the raw value. A `YYYY-MM-DD` value is
 * parsed into a LOCAL date (not `new Date(iso)`, which reads it as UTC midnight and renders the
 * previous day in negative-UTC timezones) so the label matches {@link classifyDueDate}'s urgency.
 */
export function formatDueDate(iso: string): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const parsed = dayMatch
    ? new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]))
    : new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
