/** @file Literal-union enums for the review module, shared across layers. */

/** Whether a review item is a plain discussion comment or a trackable task. */
export type ReviewItemKind = 'comment' | 'task';

/** Lifecycle status of a task-kind review item (null/absent for pure comments). */
export type ReviewItemStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix';

/**
 * How well a root item's anchor currently resolves against the live document:
 * - `located` — the relative-position anchor resolves to an exact passage.
 * - `section` — the passage is gone; the item is pinned to its enclosing section.
 * - `detached` — neither passage nor section resolves; the item lives in the tray.
 */
export type AnchorState = 'located' | 'section' | 'detached';

/** The kinds a review item may take. */
export const REVIEW_ITEM_KINDS: readonly ReviewItemKind[] = ['comment', 'task'];

/** The statuses a task may take, in lifecycle order. */
export const REVIEW_ITEM_STATUSES: readonly ReviewItemStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'wontfix',
];

/** The anchor states an item may take. */
export const ANCHOR_STATES: readonly AnchorState[] = ['located', 'section', 'detached'];

/** Narrows an arbitrary string to a {@link ReviewItemKind}. */
export function isReviewItemKind(value: string): value is ReviewItemKind {
  const kinds: readonly string[] = REVIEW_ITEM_KINDS;
  return kinds.includes(value);
}

/** Narrows an arbitrary string to a {@link ReviewItemStatus}. */
export function isReviewItemStatus(value: string): value is ReviewItemStatus {
  const statuses: readonly string[] = REVIEW_ITEM_STATUSES;
  return statuses.includes(value);
}

/** Narrows an arbitrary string to an {@link AnchorState}. */
export function isAnchorState(value: string): value is AnchorState {
  const states: readonly string[] = ANCHOR_STATES;
  return states.includes(value);
}
