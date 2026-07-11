import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewItemStatus } from '../../constants/review';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { Logger } from '../../ports/observability/logger';
import { DomainError } from '../../errors/domain-error';
import { requireProjectMember } from './review-authorization';

/** Filters for the project-wide review item list (the task panel). */
export interface ListProjectReviewItemsFilters {
  /** Restrict to items assigned to this user id. */
  assigneeId?: string;
  /** Restrict to items with this task status. */
  status?: ReviewItemStatus;
  /** Restrict to a single document id. */
  documentId?: string;
}

/** Result of {@link ListProjectReviewItemsUseCase.execute}. */
export interface ListProjectReviewItemsResult {
  /** The matching items (domain objects; DTO mapping is the API layer's job). */
  items: ReviewComment[];
}

/**
 * Lists a project's review items across documents, optionally filtered by
 * assignee, status, and document — the read behind the project-wide task panel.
 * Enforces at-least-member RBAC (any role; no audit on denial).
 */
export class ListProjectReviewItemsUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * @param actorId - The acting user.
   * @param projectId - The tenant scope.
   * @param filters - Optional assignee/status/document filters.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    filters: ListProjectReviewItemsFilters,
  ): Promise<Result<ListProjectReviewItemsResult, DomainError>> {
    const denial = await requireProjectMember(this.projectMemberRepo, projectId, actorId);
    if (denial) return { success: false, error: denial };

    const items = await this.reviewCommentRepo.listByProject(projectId, {
      assigneeId: filters.assigneeId === undefined ? undefined : UserId.create(filters.assigneeId),
      status: filters.status,
      documentId: filters.documentId === undefined ? undefined : DocumentId.create(filters.documentId),
    });
    return { success: true, value: { items } };
  }
}
