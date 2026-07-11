import type { ReviewItemStatus } from '@asciidocollab/shared';

/** Human labels for each task status, keyed by the {@link ReviewItemStatus} union. */
export const STATUS_LABELS: Record<ReviewItemStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wontfix: "Won't fix",
};

/** Badge variant per task status, so open/active tasks read louder than closed ones. */
export const STATUS_VARIANTS: Record<ReviewItemStatus, 'default' | 'secondary' | 'outline'> = {
  open: 'secondary',
  in_progress: 'default',
  resolved: 'outline',
  wontfix: 'outline',
};

/** The statuses offered in the status picker, in lifecycle order. */
export const STATUS_OPTIONS: readonly ReviewItemStatus[] = ['open', 'in_progress', 'resolved', 'wontfix'];
