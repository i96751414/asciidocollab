'use client';

import { useEffect, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTION_EMOJI_ALLOWLIST, type ReactionSummaryDto } from '@asciidocollab/shared';
import { reactToItem } from '@/lib/api/review';
import { cn } from '@/lib/utilities';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Properties for {@link ReactionBar}. */
export interface ReactionBarProperties {
  /** The owning project id (tenant key for the mutation). */
  projectId: string;
  /** The review item the reactions belong to. */
  itemId: string;
  /** The current per-emoji reaction summaries for the item. */
  reactions: ReactionSummaryDto[];
  /** When true, reactions render as read-only chips with no toggle affordance. */
  readOnly?: boolean;
  /**
   * Called with the server's updated summaries after a successful toggle.
   *
   * @param reactions - The item's reaction summaries as returned by the server.
   */
  onChanged?: (reactions: ReactionSummaryDto[]) => void;
}

/**
 * Renders an item's emoji reactions as compact chips (emoji + count, highlighted
 * when the caller has reacted) and — unless {@link ReactionBarProperties.readOnly} — an
 * "add reaction" popover listing the {@link REACTION_EMOJI_ALLOWLIST}. Clicking a
 * chip or an allowlist emoji toggles the caller's reaction via {@link reactToItem};
 * the returned summaries replace the local copy and are forwarded to `onChanged`.
 */
export function ReactionBar({ projectId, itemId, reactions, readOnly = false, onChanged }: ReactionBarProperties) {
  // Local, optimistically-replaced copy so a toggle updates immediately without a full refetch.
  const [summaries, setSummaries] = useState<ReactionSummaryDto[]>(reactions);
  const [pending, setPending] = useState(false);

  // Keep in sync when the parent supplies fresh summaries (e.g. after an SSE refetch).
  useEffect(() => {
    setSummaries(reactions);
  }, [reactions]);

  const toggle = async (emoji: string) => {
    if (readOnly || pending) return;
    setPending(true);
    try {
      const updated = await reactToItem(projectId, itemId, { emoji });
      setSummaries(updated);
      onChanged?.(updated);
    } catch {
      // Leave the existing summaries in place; a later refetch reconciles.
    } finally {
      setPending(false);
    }
  };

  const active = summaries.filter((summary) => summary.count > 0);

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="reaction-bar">
      {active.map((summary) => (
        <button
          key={summary.emoji}
          type="button"
          disabled={readOnly || pending}
          onClick={() => void toggle(summary.emoji)}
          aria-pressed={summary.reactedByMe}
          aria-label={`${summary.emoji} ${summary.count}`}
          data-testid={`review-reaction-${summary.emoji}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition-colors',
            summary.reactedByMe
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
            !readOnly && 'cursor-pointer',
            readOnly && 'cursor-default',
          )}
        >
          <span aria-hidden="true">{summary.emoji}</span>
          <span className="tabular-nums">{summary.count}</span>
        </button>
      ))}

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Add reaction"
              disabled={pending}
              data-testid="review-add-reaction"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto">
            <div className="grid grid-cols-6 gap-0.5 p-0.5">
              {REACTION_EMOJI_ALLOWLIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  data-testid={`review-react-${emoji}`}
                  onClick={() => void toggle(emoji)}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-base transition-colors hover:bg-accent"
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
