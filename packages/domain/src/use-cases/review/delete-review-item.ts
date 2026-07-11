import { Result } from '../../types/result';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { AUDIT_REVIEW_ITEM_DELETED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Result of {@link DeleteReviewItemUseCase.execute}. */
export interface DeleteReviewItemResult {
  /** Whether the item was removed. */
  deleted: boolean;
}

/**
 * Deletes a single review item within a project. Deleting a root cascades to its
 * thread (replies) and reactions at the adapter. Enforces editor/owner RBAC
 * (audited denial); persists the delete and records a success audit entry.
 */
export class DeleteReviewItemUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * @param actorId - The acting user.
   * @param projectId - The tenant scope.
   * @param reviewItemId - The item to delete.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    context?: RequestContext,
  ): Promise<Result<DeleteReviewItemResult, DomainError>> {
    const denial = await requireProjectEditor(
      this.projectMemberRepo,
      this.auditLogRepo,
      { actorId, projectId, resourceId: reviewItemId.value, context },
      this.logger,
    );
    if (denial) return { success: false, error: denial };

    const item = await this.reviewCommentRepo.findById(projectId, reviewItemId);
    if (item === null) {
      return { success: false, error: new ReviewItemNotFoundError(reviewItemId.value) };
    }

    await this.reviewCommentRepo.delete(projectId, reviewItemId);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_ITEM_DELETED,
        resourceType: 'ReviewComment',
        resourceId: reviewItemId.value,
        metadata: { documentId: item.documentId.value },
        context,
      },
      this.logger,
    );
    return { success: true, value: { deleted: true } };
  }
}
