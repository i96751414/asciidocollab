/**
 * Typed fetch client for the feature 038 review comments/tasks REST surface
 * (`/projects/:projectId/...`). Every function mirrors one API route: it attaches
 * credentials, sends/receives JSON, unwraps the `{ data }` envelope, and lets the
 * shared {@link apiRequest} throw a typed {@link ApiError} (carrying the server's
 * `{ error: { code, message } }`) on any non-2xx response.
 */

import type {
  ThreadDto,
  ReviewItemDto,
  ReactionSummaryDto,
  CreateReviewItemInput,
  ReplyInput,
  EditReviewItemInput,
  ConvertToTaskInput,
  AssignTaskInput,
  SetStatusInput,
  ReanchorInput,
  ReactInput,
  BulkDeleteDocumentInput,
  BulkDeleteProjectInput,
  BulkDeleteResultDto,
  ReviewItemStatus,
} from '@asciidocollab/shared';
import { apiRequest } from './transport';

/** Options for {@link listDocumentReviewItems}. */
export interface ListDocumentReviewItemsOptions {
  /** When true, include resolved items in the returned threads. */
  includeResolved?: boolean;
}

/** Filters for the project-wide task/comment list ({@link listProjectReviewItems}). */
export interface ProjectReviewItemFilters {
  /** Limit to items assigned to this user id. */
  assigneeId?: string;
  /** Limit to items with this task status. */
  status?: ReviewItemStatus;
  /** Limit to items on this document. */
  documentId?: string;
}

/** The PATCH body discriminated on `op` (edit / convert / assign / status). */
export type PatchReviewItemBody =
  | ({ op: 'edit' } & EditReviewItemInput)
  | ({ op: 'convert' } & ConvertToTaskInput)
  | ({ op: 'assign' } & AssignTaskInput)
  | ({ op: 'status' } & SetStatusInput);

/** Appends the defined entries of `parameters` to a query string (empty when none apply). */
function toQueryString(parameters: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Lists a document's review threads (root + replies), optionally including resolved items. */
export async function listDocumentReviewItems(
  projectId: string,
  documentId: string,
  options: ListDocumentReviewItemsOptions = {},
): Promise<ThreadDto[]> {
  const query = toQueryString({ includeResolved: options.includeResolved ? true : undefined });
  const { data } = await apiRequest<{ data: { threads: ThreadDto[] } }>(
    `/projects/${projectId}/documents/${documentId}/review-items${query}`,
  );
  return data.threads;
}

/** Lists a whole project's review items (flat), filtered for the task panel. */
export async function listProjectReviewItems(
  projectId: string,
  filters: ProjectReviewItemFilters = {},
): Promise<ReviewItemDto[]> {
  const query = toQueryString({
    assigneeId: filters.assigneeId,
    status: filters.status,
    documentId: filters.documentId,
  });
  const { data } = await apiRequest<{ data: { items: ReviewItemDto[] } }>(
    `/projects/${projectId}/review-items${query}`,
  );
  return data.items;
}

/** Creates a root comment/task on a document passage. */
export async function createReviewItem(
  projectId: string,
  documentId: string,
  input: CreateReviewItemInput,
): Promise<ReviewItemDto> {
  const { data } = await apiRequest<{ data: ReviewItemDto }>(
    `/projects/${projectId}/documents/${documentId}/review-items`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

/** Adds a reply to an existing thread. */
export async function replyToThread(
  projectId: string,
  id: string,
  input: ReplyInput,
): Promise<ReviewItemDto> {
  const { data } = await apiRequest<{ data: ReviewItemDto }>(
    `/projects/${projectId}/review-items/${id}/replies`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

/** Edits an existing item's body (author only). Routes through the shared PATCH client. */
export async function editReviewItem(
  projectId: string,
  id: string,
  input: EditReviewItemInput,
): Promise<ReviewItemDto> {
  return patchReviewItem(projectId, id, { op: 'edit', ...input });
}

/** Resolves a comment thread, or reopens it when `reopen` is true. */
export async function resolveReviewItem(
  projectId: string,
  id: string,
  reopen = false,
): Promise<ReviewItemDto> {
  const { data } = await apiRequest<{ data: ReviewItemDto }>(
    `/projects/${projectId}/review-items/${id}/resolve`,
    { method: 'POST', body: JSON.stringify({ reopen }) },
  );
  return data;
}

/** Toggles the caller's emoji reaction on an item, returning the updated summaries. */
export async function reactToItem(
  projectId: string,
  id: string,
  input: ReactInput,
): Promise<ReactionSummaryDto[]> {
  const { data } = await apiRequest<{ data: { reactions: ReactionSummaryDto[] } }>(
    `/projects/${projectId}/review-items/${id}/reactions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data.reactions;
}

/** Patches a task via the `op` discriminator (convert / assign / status). */
export async function patchReviewItem(
  projectId: string,
  id: string,
  body: PatchReviewItemBody,
): Promise<ReviewItemDto> {
  const { data } = await apiRequest<{ data: ReviewItemDto }>(
    `/projects/${projectId}/review-items/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  return data;
}

/** Converts a comment to a task (or a task back to a comment). */
export async function convertReviewItem(
  projectId: string,
  id: string,
  input: ConvertToTaskInput,
): Promise<ReviewItemDto> {
  return patchReviewItem(projectId, id, { op: 'convert', ...input });
}

/** Assigns (or clears) a task's assignee and optional due date. */
export async function assignTask(
  projectId: string,
  id: string,
  input: AssignTaskInput,
): Promise<ReviewItemDto> {
  return patchReviewItem(projectId, id, { op: 'assign', ...input });
}

/** Sets a task's lifecycle status. */
export async function setTaskStatus(
  projectId: string,
  id: string,
  input: SetStatusInput,
): Promise<ReviewItemDto> {
  return patchReviewItem(projectId, id, { op: 'status', ...input });
}

/** Manually reattaches a section/detached item to a new passage. */
export async function reanchorReviewItem(
  projectId: string,
  id: string,
  input: ReanchorInput,
): Promise<ReviewItemDto> {
  const { data } = await apiRequest<{ data: ReviewItemDto }>(
    `/projects/${projectId}/review-items/${id}/reanchor`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

/** Deletes a single item (root ⇒ its whole thread). */
export async function deleteReviewItem(projectId: string, id: string): Promise<void> {
  await apiRequest<{ data: { deleted: boolean } }>(
    `/projects/${projectId}/review-items/${id}`,
    { method: 'DELETE' },
  );
}

/** Bulk-deletes every review item on one document. */
export async function bulkDeleteDocument(
  projectId: string,
  documentId: string,
  input: BulkDeleteDocumentInput,
): Promise<BulkDeleteResultDto> {
  const { data } = await apiRequest<{ data: BulkDeleteResultDto }>(
    `/projects/${projectId}/documents/${documentId}/review-items/bulk-delete`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

/** Bulk-deletes every review item across a whole project (owner only). */
export async function bulkDeleteProject(
  projectId: string,
  input: BulkDeleteProjectInput,
): Promise<BulkDeleteResultDto> {
  const { data } = await apiRequest<{ data: BulkDeleteResultDto }>(
    `/projects/${projectId}/review-items/bulk-delete`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}
