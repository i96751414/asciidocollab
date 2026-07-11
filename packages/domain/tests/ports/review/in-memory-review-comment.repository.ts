import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import {
  ReviewCommentRepository,
  ListByDocumentOptions,
  ListByProjectFilters,
} from '../../../src/ports/review/review-comment.repository';

/** In-memory ReviewCommentRepository for use-case tests. Cascades thread deletes; tenant-filtered. */
export class InMemoryReviewCommentRepository implements ReviewCommentRepository {
  private readonly storage = new Map<string, ReviewComment>();

  async create(comment: ReviewComment): Promise<void> {
    this.storage.set(comment.id.value, comment);
  }

  async update(comment: ReviewComment): Promise<void> {
    this.storage.set(comment.id.value, comment);
  }

  async findById(projectId: ProjectId, id: ReviewCommentId): Promise<ReviewComment | null> {
    const found = this.storage.get(id.value);
    return found && found.projectId.value === projectId.value ? found : null;
  }

  async listByDocument(
    projectId: ProjectId,
    documentId: DocumentId,
    options: ListByDocumentOptions,
  ): Promise<ReviewComment[]> {
    return this.all()
      .filter((c) => c.projectId.value === projectId.value && c.documentId.value === documentId.value)
      .filter((c) => options.includeResolved || c.isReply() || !c.isResolved());
  }

  async listByProject(projectId: ProjectId, filters: ListByProjectFilters): Promise<ReviewComment[]> {
    return this.all().filter((c) => {
      if (c.projectId.value !== projectId.value) return false;
      if (filters.documentId && c.documentId.value !== filters.documentId.value) return false;
      if (filters.assigneeId && c.assigneeId?.value !== filters.assigneeId.value) return false;
      if (filters.status && c.status !== filters.status) return false;
      return true;
    });
  }

  async delete(projectId: ProjectId, id: ReviewCommentId): Promise<void> {
    const target = this.storage.get(id.value);
    if (!target || target.projectId.value !== projectId.value) return;
    this.storage.delete(id.value);
    // Cascade the thread: remove replies whose parent is this root.
    for (const [key, item] of this.storage) {
      if (item.parentId?.value === id.value) this.storage.delete(key);
    }
  }

  async deleteByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number> {
    return this.removeWhere(
      (c) => c.projectId.value === projectId.value && c.documentId.value === documentId.value,
    );
  }

  async deleteByProject(projectId: ProjectId): Promise<number> {
    return this.removeWhere((c) => c.projectId.value === projectId.value);
  }

  async countByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number> {
    return this.all().filter(
      (c) => c.projectId.value === projectId.value && c.documentId.value === documentId.value,
    ).length;
  }

  async countByProject(projectId: ProjectId): Promise<number> {
    return this.all().filter((c) => c.projectId.value === projectId.value).length;
  }

  private all(): ReviewComment[] {
    return [...this.storage.values()];
  }

  private removeWhere(predicate: (c: ReviewComment) => boolean): number {
    let removed = 0;
    for (const [key, item] of this.storage) {
      if (predicate(item)) {
        this.storage.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
