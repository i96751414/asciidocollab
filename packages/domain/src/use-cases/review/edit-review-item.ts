import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { REVIEW_BODY_MAX_LEN } from '../../constants/review';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/common/validation-error';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { AUDIT_REVIEW_EDITED } from '../../audit-actions';
import { recordAuditSuccess, recordAuthorizationDenial } from '../audit-recording';
import { requireProjectEditor, REVIEW_RESOURCE_TYPE } from './review-authorization';

/** Command to edit a review item's body. */
export interface EditReviewItemCommand {
  /** The replacement body text. */
  body: string;
}

/** Result of {@link EditReviewItemUseCase.execute}. */
export interface EditReviewItemResult {
  /** The item with its updated body. */
  item: ReviewComment;
}

/**
 * Edits the body of a review comment, task, or reply. Enforces editor/owner RBAC
 * (audited denial) and, beyond that, restricts the edit to the item's original
 * author — an editor may resolve, assign, or delete another person's item, but
 * rewriting the words attributed to someone else is disallowed (audited as
 * `not_author`). Validates a non-empty body within {@link REVIEW_BODY_MAX_LEN},
 * persists the change, and records a success audit entry.
 */
export class EditReviewItemUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * @param actorId - The acting user (must be the item's author).
   * @param projectId - The tenant scope.
   * @param reviewItemId - The item whose body to edit.
   * @param command - The replacement body.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: EditReviewItemCommand,
    context?: RequestContext,
  ): Promise<Result<EditReviewItemResult, DomainError>> {
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

    // Editors can manage any item, but only the author may rewrite its body.
    if (item.authorId?.value !== actorId.value) {
      await recordAuthorizationDenial(
        this.auditLogRepo,
        { actorId, projectId, resourceType: REVIEW_RESOURCE_TYPE, resourceId: reviewItemId.value, reason: 'not_author', context },
        this.logger,
      );
      return { success: false, error: new PermissionDeniedError('Only the author can edit this item', REVIEW_RESOURCE_TYPE, reviewItemId.value, 'not_author') };
    }

    const body = command.body.trim();
    if (body.length === 0) {
      return { success: false, error: new ValidationError('review body must be non-empty') };
    }
    if (body.length > REVIEW_BODY_MAX_LEN) {
      return { success: false, error: new ValidationError(`review body exceeds ${REVIEW_BODY_MAX_LEN} characters`) };
    }

    item.editBody(body);
    await this.reviewCommentRepo.update(item);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_EDITED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { documentId: item.documentId.value },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
