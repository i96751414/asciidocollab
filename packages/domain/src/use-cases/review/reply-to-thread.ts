import { randomUUID } from 'crypto';
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
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_REPLIED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Command to reply to a review thread. */
export interface ReplyToThreadCommand {
  /** The reply body text. */
  body: string;
}

/** Result of {@link ReplyToThreadUseCase.execute}. */
export interface ReplyToThreadResult {
  /** The newly created reply. */
  reply: ReviewComment;
}

/**
 * Appends a reply to a comment/task thread. Enforces editor/owner RBAC (audited
 * denial), a non-empty body within {@link REVIEW_BODY_MAX_LEN}, and that the
 * target is a thread root (replies fan out from the root, never from a reply);
 * persists the reply and records a success audit entry.
 */
export class ReplyToThreadUseCase {
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
   * @param reviewItemId - The thread root to reply to.
   * @param command - The reply to create.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: ReplyToThreadCommand,
    context?: RequestContext,
  ): Promise<Result<ReplyToThreadResult, DomainError>> {
    const denial = await requireProjectEditor(
      this.projectMemberRepo,
      this.auditLogRepo,
      { actorId, projectId, resourceId: reviewItemId.value, context },
      this.logger,
    );
    if (denial) return { success: false, error: denial };

    const root = await this.reviewCommentRepo.findById(projectId, reviewItemId);
    if (root === null) {
      return { success: false, error: new ReviewItemNotFoundError(reviewItemId.value) };
    }
    if (!root.isRoot()) {
      return {
        success: false,
        error: new ReviewOperationInvalidError('a reply must target a thread root'),
      };
    }

    const body = command.body.trim();
    if (body.length === 0) {
      return { success: false, error: new ValidationError('review body must be non-empty') };
    }
    if (body.length > REVIEW_BODY_MAX_LEN) {
      return { success: false, error: new ValidationError(`review body exceeds ${REVIEW_BODY_MAX_LEN} characters`) };
    }

    const reply = new ReviewComment(
      ReviewCommentId.create(randomUUID()),
      projectId,
      root.documentId,
      root.id,
      'comment',
      body,
      actorId,
    );

    await this.reviewCommentRepo.create(reply);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_REPLIED,
        resourceType: 'ReviewComment',
        resourceId: reply.id.value,
        metadata: { rootId: root.id.value, documentId: root.documentId.value },
        context,
      },
      this.logger,
    );
    return { success: true, value: { reply } };
  }
}
