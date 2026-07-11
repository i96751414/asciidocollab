'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Link2, Unlink } from 'lucide-react';
import type { AnchorState, ReviewItemDto } from '@asciidocollab/shared';
import { resolveReviewItem } from '@/lib/api/review';
import { cn } from '@/lib/utilities';
import { Button } from '@/components/ui/button';
import { ReviewAvatar } from './thread-card';

/** One tray entry: a root item whose anchor no longer resolves cleanly, plus its degraded state. */
export interface DetachedTrayEntry {
  /** The root review item that lost its passage. */
  item: ReviewItemDto;
  /** The item's current anchor state (`detached`, or `section` when only the structure survived). */
  state: AnchorState;
}

/** Properties for {@link DetachedTray}. */
export interface DetachedTrayProperties {
  /** The owning project id (tenant key for the Resolve mutation). */
  projectId: string;
  /** The detached/section entries for the current document. */
  entries: DetachedTrayEntry[];
  /** When true, hides Reattach/Resolve (viewer/observer mode, T043). */
  readOnly?: boolean;
  /**
   * Enters reattach mode for an item; the editor-wiring task fills this in to capture a new
   * selection and call {@link reanchorReviewItem}. Left as a callback so the tray stays standalone.
   *
   * @param itemId - The root item id the user wants to reattach.
   */
  onReattach?: (itemId: string) => void;
  /** Called after a Resolve succeeds so the owner can refetch. */
  onChanged?: () => void;
}

/** A short, single-line preview of an item's body for the dense tray rows. */
function previewOf(body: string): string {
  const trimmed = body.trim().replaceAll(/\s+/g, ' ');
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
}

/** One tray row: the item preview, its state indicator, and (unless read-only) Reattach / Resolve. */
function TrayRow({
  projectId,
  entry,
  readOnly,
  onReattach,
  onChanged,
}: {
  projectId: string;
  entry: DetachedTrayEntry;
  readOnly: boolean;
  onReattach?: (itemId: string) => void;
  onChanged?: () => void;
}) {
  const [resolving, setResolving] = useState(false);
  const { item, state } = entry;

  const handleResolve = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      await resolveReviewItem(projectId, item.id);
      onChanged?.();
    } finally {
      setResolving(false);
    }
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-md border bg-card p-2 text-card-foreground" data-item-id={item.id}>
      <div className="flex items-center gap-2">
        <ReviewAvatar user={item.author} />
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            state === 'section'
              ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
              : 'border-destructive/40 text-destructive',
          )}
          title={state === 'section' ? 'Anchored to its section' : 'Passage was removed'}
        >
          {state === 'section' ? (
            <Link2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Unlink className="h-3 w-3" aria-hidden="true" />
          )}
          {state === 'section' ? 'On section' : 'Detached'}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{previewOf(item.body)}</p>
      {!readOnly && (
        <div className="flex items-center gap-1">
          {onReattach && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              data-testid="detached-reattach"
              onClick={() => onReattach(item.id)}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              Reattach
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={resolving}
            className="h-7 gap-1 px-2 text-xs"
            data-testid="detached-resolve"
            onClick={() => void handleResolve()}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Resolve
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * A per-document collapsible tray for review items whose passage no longer resolves (T040). It lists
 * `detached` items (and any `section`-degraded items the caller chooses to pass) with a state
 * indicator, a Reattach affordance (delegated to `onReattach` for the wiring task to capture a new
 * selection → {@link reanchorReviewItem}), and a Resolve action. Renders nothing when there are no
 * entries; mutation controls are hidden when `readOnly`.
 */
export function DetachedTray({
  projectId,
  entries,
  readOnly = false,
  onReattach,
  onChanged,
}: DetachedTrayProperties) {
  const [open, setOpen] = useState(true);

  if (entries.length === 0) return null;

  return (
    <section
      data-testid="detached-tray"
      aria-label="Detached comments"
      className="mb-2 rounded-lg border border-dashed"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-t-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
        Detached
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 tabular-nums" data-testid="detached-tray-count">
          {entries.length}
        </span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 p-2 pt-0">
          {entries.map((entry) => (
            <TrayRow
              key={entry.item.id}
              projectId={projectId}
              entry={entry}
              readOnly={readOnly}
              onReattach={onReattach}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
