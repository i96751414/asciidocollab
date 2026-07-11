import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewReaction } from '../../entities/review-reaction';
import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ReviewReactionRepository } from '../../ports/review/review-reaction.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { DomainError } from '../../errors/domain-error';
import { requireProjectMember } from './review-authorization';

/** Options for {@link ListReviewItemsUseCase.execute}. */
export interface ListReviewItemsOptions {
  /** When false, resolved roots are omitted (the default view). */
  includeResolved: boolean;
}

/** Result of {@link ListReviewItemsUseCase.execute} — raw domain objects for the API to map. */
export interface ListReviewItemsResult {
  /** The document's review items (roots + replies). */
  items: ReviewComment[];
  /** Every reaction attached to those items. */
  reactions: ReviewReaction[];
}

/**
 * Lists a document's review items with their reactions. A read path: enforces
 * project-member RBAC (viewer+, no audit) and returns raw domain objects — DTO
 * shaping belongs to the API layer.
 */
export class ListReviewItemsUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly reviewReactionRepo: ReviewReactionRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
  ) {}

  /**
   * @param actorId - The acting user.
   * @param projectId - The tenant scope.
   * @param documentId - The document whose items to list.
   * @param options - Whether to include resolved roots.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    documentId: DocumentId,
    options: ListReviewItemsOptions,
  ): Promise<Result<ListReviewItemsResult, DomainError>> {
    const denial = await requireProjectMember(this.projectMemberRepo, projectId, actorId);
    if (denial) return { success: false, error: denial };

    const items = await this.reviewCommentRepo.listByDocument(projectId, documentId, {
      includeResolved: options.includeResolved,
    });
    const reactions = await this.reviewReactionRepo.listForItems(items.map((item) => item.id));
    return { success: true, value: { items, reactions } };
  }
}
