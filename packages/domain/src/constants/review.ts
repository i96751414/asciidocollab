/** @file Canonical review enums + constants for the domain layer (shared DTOs mirror these). */

/**
 * Maximum length, in characters, of a review comment/reply body. The single
 * authority for body length across every layer: the domain use cases enforce it,
 * and `@asciidocollab/shared` re-exports this exact constant for the API boundary.
 */
export const REVIEW_BODY_MAX_LEN = 4000;

/** The kinds a review item may take. */
export const REVIEW_ITEM_KINDS = ['comment', 'task'] as const;
/** Whether a review item is a plain discussion comment or a trackable task. */
export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

/** The statuses a task may take, in lifecycle order. */
export const REVIEW_ITEM_STATUSES = ['open', 'in_progress', 'resolved', 'wontfix'] as const;
/** Lifecycle status of a task-kind item (null for pure comments). */
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

/** The anchor states an item may take (degradation ladder). */
export const ANCHOR_STATES = ['located', 'section', 'detached'] as const;
/** How well a root item's anchor currently resolves against the live document. */
export type AnchorState = (typeof ANCHOR_STATES)[number];

/** The task statuses that represent a resolved/closed task (stamp resolvedAt/By). */
export const RESOLVED_TASK_STATUSES: readonly ReviewItemStatus[] = ['resolved', 'wontfix'];

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

/** True when a task status counts as resolved (carries a resolution stamp). */
export function isResolvedStatus(status: ReviewItemStatus): boolean {
  return RESOLVED_TASK_STATUSES.includes(status);
}
