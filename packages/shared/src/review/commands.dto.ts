/** @file Command-input DTOs for review write operations (request bodies). */

import type { AnchorQuoteDto } from './review.dto';
import type { ReviewItemKind, ReviewItemStatus } from './enums';

/** Anchor payload supplied when creating a root item. */
export interface CreateAnchorInput {
  /** Base64-encoded Yjs RelativePosition pair (start,end). */
  relPos?: string;
  /** Text-quote selector; `exact` is required. */
  quote: AnchorQuoteDto;
  /** 1-based line hint at creation. */
  lineHint?: number;
  /** Enclosing section symbol id. */
  sectionId?: string;
}

/** Create a root comment or task on a document passage. */
export interface CreateReviewItemInput {
  /** Whether to create a comment or a task. */
  kind: ReviewItemKind;
  /** The body text (non-empty, ≤ REVIEW_BODY_MAX_LEN). */
  body: string;
  /** The passage anchor. */
  anchor: CreateAnchorInput;
}

/** Reply to an existing thread. */
export interface ReplyInput {
  /** The reply body (non-empty, ≤ REVIEW_BODY_MAX_LEN). */
  body: string;
}

/** Edit an existing item's body (author only). */
export interface EditReviewItemInput {
  /** The replacement body (non-empty, ≤ REVIEW_BODY_MAX_LEN). */
  body: string;
}

/** Resolve a comment thread (comments only; tasks resolve via status). */
export interface ResolveInput {
  /** No fields — resolution is derived from the caller and item. */
  readonly _?: never;
}

/** Convert a comment to a task or a task back to a comment. */
export interface ConvertToTaskInput {
  /** Target kind after conversion. */
  kind: ReviewItemKind;
}

/** Assign (or clear) a task's assignee and optional due date. */
export interface AssignTaskInput {
  /** The assignee user id, or null to clear the assignment. */
  assigneeId: string | null;
  /** Optional due date, ISO-8601 date string, or null to clear it. */
  dueDate?: string | null;
}

/** Set a task's lifecycle status. */
export interface SetStatusInput {
  /** The target status. */
  status: ReviewItemStatus;
}

/** Manually reattach a section/detached item to a new passage. */
export interface ReanchorInput {
  /** The new passage anchor. */
  anchor: CreateAnchorInput;
}

/** Toggle the caller's reaction with a single emoji. */
export interface ReactInput {
  /** The unicode emoji (validated against the allowlist at the boundary). */
  emoji: string;
}

/** Delete a single item (root ⇒ its thread). */
export interface DeleteInput {
  /** No fields — the target is the route id. */
  readonly _?: never;
}

/** Bulk-delete every item on one document. */
export interface BulkDeleteDocumentInput {
  /** Must be true; an explicit client confirmation. */
  confirm: true;
  /** Optional optimistic count guard — 409 if the live count differs. */
  expectedCount?: number;
}

/** Bulk-delete every item across a whole project (owner only). */
export interface BulkDeleteProjectInput {
  /** Must be true; an explicit client confirmation. */
  confirm: true;
  /** Optional optimistic count guard — 409 if the live count differs. */
  expectedCount?: number;
}

/** Result of a bulk-delete operation. */
export interface BulkDeleteResultDto {
  /** How many items were deleted. */
  deleted: number;
}
