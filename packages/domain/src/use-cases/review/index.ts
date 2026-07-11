/** @file Barrel re-exports for review-module use cases (feature 038). */

// Authorization helpers
export {
  requireProjectEditor,
  requireProjectOwner,
  requireProjectMember,
  REVIEW_RESOURCE_TYPE,
} from './review-authorization';
export type { ReviewAuthzContext } from './review-authorization';

// US1 — comment/thread/reactions/list
export { CreateReviewCommentUseCase } from './create-review-comment';
export type {
  CreateReviewItemCommand,
  CreateReviewItemResult,
  CreateAnchorCommand,
} from './create-review-comment';
export { ReplyToThreadUseCase } from './reply-to-thread';
export type { ReplyToThreadCommand, ReplyToThreadResult } from './reply-to-thread';
export { EditReviewItemUseCase } from './edit-review-item';
export type { EditReviewItemCommand, EditReviewItemResult } from './edit-review-item';
export { ResolveReviewItemUseCase } from './resolve-review-item';
export type { ResolveReviewItemResult } from './resolve-review-item';
export { ListReviewItemsUseCase } from './list-review-items';
export type { ListReviewItemsOptions, ListReviewItemsResult } from './list-review-items';
export { ReactToItemUseCase } from './react-to-item';
export type { ReactToItemCommand, ReactToItemResult } from './react-to-item';

// US2 — tasks
export { ConvertToTaskUseCase } from './convert-to-task';
export type { ConvertToTaskCommand, ConvertToTaskResult } from './convert-to-task';
export { AssignTaskUseCase } from './assign-task';
export type { AssignTaskCommand, AssignTaskResult } from './assign-task';
export { SetTaskStatusUseCase } from './set-task-status';
export type { SetTaskStatusCommand, SetTaskStatusResult } from './set-task-status';
export { ListProjectReviewItemsUseCase } from './list-project-review-items';
export type {
  ListProjectReviewItemsFilters,
  ListProjectReviewItemsResult,
} from './list-project-review-items';

// US3 — reanchor
export { ReanchorReviewItemUseCase } from './reanchor-review-item';
export type {
  ReanchorAnchorCommand,
  ReanchorReviewItemCommand,
  ReanchorReviewItemResult,
} from './reanchor-review-item';

// US5 — delete / bulk delete
export { DeleteReviewItemUseCase } from './delete-review-item';
export type { DeleteReviewItemResult } from './delete-review-item';
export { BulkDeleteForDocumentUseCase } from './bulk-delete-for-document';
export type {
  BulkDeleteForDocumentCommand,
  BulkDeleteForDocumentResult,
} from './bulk-delete-for-document';
export { BulkDeleteForProjectUseCase } from './bulk-delete-for-project';
export type {
  BulkDeleteForProjectCommand,
  BulkDeleteForProjectResult,
} from './bulk-delete-for-project';
