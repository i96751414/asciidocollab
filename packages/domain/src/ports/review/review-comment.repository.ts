import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewItemStatus } from '../../constants/review';

/** Options for listing a document's review items. */
export interface ListByDocumentOptions {
  /** When false, resolved items are omitted (the default view). */
  includeResolved: boolean;
}

/** Filters for the project-wide review item list (the task panel). */
export interface ListByProjectFilters {
  /** Restrict to items assigned to this user. */
  assigneeId?: UserId;
  /** Restrict to items with this task status. */
  status?: ReviewItemStatus;
  /** Restrict to a single document. */
  documentId?: DocumentId;
}

/**
 * Persistence port for review items (comments/tasks). Every read and write is
 * tenant-scoped by `projectId`; a caller can never reach another project's items.
 * Deleting a root cascades to its replies and reactions (at the adapter).
 */
export interface ReviewCommentRepository {
  /**
   * Persists a new review item.
   *
   * @param comment - The item to insert.
   * @returns A promise that resolves once the item is persisted.
   */
  create(comment: ReviewComment): Promise<void>;

  /**
   * Finds one item by id within a project, or null.
   *
   * @param projectId - The tenant scope.
   * @param id - The item id.
   * @returns The matching item, or null when none exists in the project.
   */
  findById(projectId: ProjectId, id: ReviewCommentId): Promise<ReviewComment | null>;

  /**
   * Lists a document's items (roots + replies) within a project.
   *
   * @param projectId - The tenant scope.
   * @param documentId - The document to list.
   * @param options - Whether resolved items are included.
   * @returns The document's items (roots and replies) in the project.
   */
  listByDocument(
    projectId: ProjectId,
    documentId: DocumentId,
    options: ListByDocumentOptions,
  ): Promise<ReviewComment[]>;

  /**
   * Lists a project's items across documents, optionally filtered.
   *
   * @param projectId - The tenant scope.
   * @param filters - Optional assignee/status/document filters.
   * @returns The project's matching items across documents.
   */
  listByProject(projectId: ProjectId, filters: ListByProjectFilters): Promise<ReviewComment[]>;

  /**
   * Persists changes to an existing item.
   *
   * @param comment - The mutated item to save.
   * @returns A promise that resolves once the changes are persisted.
   */
  update(comment: ReviewComment): Promise<void>;

  /**
   * Deletes one item within a project (a root cascades to its thread + reactions).
   *
   * @param projectId - The tenant scope.
   * @param id - The item to delete.
   * @returns A promise that resolves once the item (and its thread) is removed.
   */
  delete(projectId: ProjectId, id: ReviewCommentId): Promise<void>;

  /**
   * Deletes every item on a document within a project.
   *
   * @param projectId - The tenant scope.
   * @param documentId - The document to clear.
   * @returns The number of items removed.
   */
  deleteByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number>;

  /**
   * Deletes every item across a project.
   *
   * @param projectId - The tenant scope.
   * @returns The number of items removed.
   */
  deleteByProject(projectId: ProjectId): Promise<number>;

  /**
   * Counts every item on a document within a project (for the optimistic bulk-delete guard).
   *
   * @param projectId - The tenant scope.
   * @param documentId - The document to count.
   * @returns The live item count.
   */
  countByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number>;

  /**
   * Counts every item across a project (for the optimistic bulk-delete guard).
   *
   * @param projectId - The tenant scope.
   * @returns The live item count.
   */
  countByProject(projectId: ProjectId): Promise<number>;
}
