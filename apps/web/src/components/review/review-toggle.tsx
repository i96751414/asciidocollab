'use client';

import { MessageSquare, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utilities';

/** Properties for {@link ReviewToggle}. */
export interface ReviewToggleProperties {
  /** The number of open (unresolved) review items, shown as a badge. */
  openCount: number;
  /** Whether the comments panel is currently open (drives the pressed styling + icon). */
  isOpen: boolean;
  /** Toggles the comments panel open/closed (restoring a hidden panel). */
  onToggle: () => void;
}

/**
 * The persistent top-right toolbar button that shows/hides the review comments panel (T026).
 * It surfaces the OPEN item count as a badge and swaps between the outline / filled speech-bubble
 * icon to reflect the panel's open state. Clicking always toggles the panel, so a hidden panel is
 * restored from here even when its resizable column is fully collapsed.
 */
export function ReviewToggle({ openCount, isOpen, onToggle }: ReviewToggleProperties) {
  const Icon = isOpen ? MessagesSquare : MessageSquare;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isOpen}
      aria-label={isOpen ? 'Hide comments' : 'Show comments'}
      data-testid="review-toggle"
      className={cn(
        'relative inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isOpen
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Comments</span>
      {openCount > 0 && (
        <span
          data-testid="review-toggle-count"
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground"
        >
          {openCount}
        </span>
      )}
    </button>
  );
}
