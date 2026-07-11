'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BulkDeleteResultDto } from '@asciidocollab/shared';
import { bulkDeleteDocument, bulkDeleteProject, deleteReviewItem } from '@/lib/api/review';
import { cn } from '@/lib/utilities';

/**
 * A tiny two-step destructive control: a primary trigger that, once clicked, reveals an explicit
 * "Confirm" / "Cancel" pair so the underlying delete never fires on a single click. Rendered as
 * plain buttons so it slots equally into a dropdown menu or a toolbar and stays trivially testable.
 */
function ConfirmDelete({
  triggerLabel,
  confirmPrompt,
  confirmLabel,
  disabled,
  onConfirm,
  testId,
  triggerClassName,
}: {
  /** The label on the initial (arming) trigger. */
  triggerLabel: string;
  /** The prompt shown once armed, e.g. "Delete 4 items?". */
  confirmPrompt: string;
  /** The label on the destructive confirm button. */
  confirmLabel: string;
  /** Disables the whole control while a delete is in flight. */
  disabled?: boolean;
  /** Runs the destructive action; awaited so the control can show a pending state. */
  onConfirm: () => Promise<void>;
  /** Stable test id for the arming trigger. */
  testId?: string;
  /** Extra classes for the arming trigger. */
  triggerClassName?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      setArmed(false);
    } finally {
      setPending(false);
    }
  };

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        onClick={(event) => {
          event.stopPropagation();
          setArmed(true);
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          triggerClassName,
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
      <p className="text-xs text-muted-foreground">{confirmPrompt}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          data-testid={testId ? `${testId}-confirm` : undefined}
          onClick={() => void confirm()}
          className="inline-flex h-7 items-center rounded-md bg-destructive px-2.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setArmed(false)}
          className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Properties for {@link DeleteItemAction}. */
export interface DeleteItemActionProperties {
  /** The owning project id. */
  projectId: string;
  /** The item id to delete (a root deletes its whole thread). */
  itemId: string;
  /** Whether this item is a root, which deletes the whole thread, versus a reply; drives the confirm copy. */
  isRoot?: boolean;
  /** Hides the control entirely (viewer/observer mode, T043). */
  readOnly?: boolean;
  /** Called after the delete succeeds so the owner can refetch. */
  onDeleted?: () => void;
}

/**
 * The per-item Delete action for {@link ReviewThreadCard}'s `itemMenuExtra` overflow slot (T049).
 * Deleting a root removes its whole thread; the destructive call is gated behind an explicit
 * in-menu confirm and hidden when `readOnly`.
 */
export function DeleteItemAction({
  projectId,
  itemId,
  isRoot = true,
  readOnly = false,
  onDeleted,
}: DeleteItemActionProperties) {
  if (readOnly) return null;
  return (
    <ConfirmDelete
      triggerLabel="Delete"
      confirmPrompt={isRoot ? 'Delete this thread and all its replies?' : 'Delete this reply?'}
      confirmLabel="Delete"
      testId="delete-item"
      onConfirm={async () => {
        await deleteReviewItem(projectId, itemId);
        onDeleted?.();
      }}
    />
  );
}

/** Properties for {@link BulkDeleteDocumentAction}. */
export interface BulkDeleteDocumentActionProperties {
  /** The owning project id. */
  projectId: string;
  /** The document whose review items should all be deleted. */
  documentId: string;
  /** The current item count, shown in the confirm and sent as the optimistic `expectedCount` guard. */
  count: number;
  /** Hides the control entirely (viewer/observer mode, T043). */
  readOnly?: boolean;
  /**
   * Called with the server's result after the bulk delete succeeds.
   *
   * @param result - How many items the server deleted.
   */
  onDeleted?: (result: BulkDeleteResultDto) => void;
}

/**
 * The "Delete all in this document" action for {@link CommentRail}'s document-scope `⋯` menu. It
 * removes every row on the document — roots, replies, and resolved threads alike — so it does NOT
 * send an `expectedCount` guard: `count` here is only the visible (filtered, roots-only) thread count,
 * which never matches the server's all-rows total and would 409 on any document with a reply or a
 * resolved thread. Hidden when `readOnly`; disabled when nothing is visible to delete.
 */
export function BulkDeleteDocumentAction({
  projectId,
  documentId,
  count,
  readOnly = false,
  onDeleted,
}: BulkDeleteDocumentActionProperties) {
  if (readOnly) return null;
  return (
    <ConfirmDelete
      triggerLabel="Delete all in this document"
      confirmPrompt="Delete every comment and task in this document? This cannot be undone."
      confirmLabel="Delete all"
      disabled={count === 0}
      testId="bulk-delete-document"
      onConfirm={async () => {
        const result = await bulkDeleteDocument(projectId, documentId, { confirm: true });
        onDeleted?.(result);
      }}
    />
  );
}

/** Properties for {@link ProjectBulkDeleteButton}. */
export interface ProjectBulkDeleteButtonProperties {
  /** The owning project id. */
  projectId: string;
  /** The current project-wide item count, shown in the confirm and sent as `expectedCount`. */
  count: number;
  /** Only project owners may delete across the whole project; false hides the control (T049). */
  isOwner?: boolean;
  /** Hides the control entirely (viewer/observer mode, T043). */
  readOnly?: boolean;
  /**
   * Called with the server's result after the project-wide bulk delete succeeds.
   *
   * @param result - How many items the server deleted.
   */
  onDeleted?: (result: BulkDeleteResultDto) => void;
}

/**
 * The owner-only "Delete all across the project" action for {@link TaskPanel}'s project-scope `⋯` menu
 * (T049). Rendered as a menu item (mirroring {@link BulkDeleteDocumentAction}) only when `isOwner` and
 * not `readOnly`; the destructive call is gated behind an explicit confirm and carries the live count
 * as `expectedCount`.
 */
export function ProjectBulkDeleteButton({
  projectId,
  count,
  isOwner = false,
  readOnly = false,
  onDeleted,
}: ProjectBulkDeleteButtonProperties) {
  if (readOnly || !isOwner) return null;
  return (
    <ConfirmDelete
      triggerLabel="Delete all across the project"
      confirmPrompt={`Delete all ${count} review item${count === 1 ? '' : 's'} across the project? This cannot be undone.`}
      confirmLabel="Delete everything"
      disabled={count === 0}
      testId="bulk-delete-project"
      onConfirm={async () => {
        const result = await bulkDeleteProject(projectId, { confirm: true, expectedCount: count });
        onDeleted?.(result);
      }}
    />
  );
}
