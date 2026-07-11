import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
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
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_RESOLVED, AUDIT_REVIEW_REOPENED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Result of {@link ResolveReviewItemUseCase.execute}. */
export interface ResolveReviewItemResult {
  /** The (idempotently) resolved comment item. */
  item: ReviewComment;
}

/**
 * Resolves — or reopens — a comment thread, the comment-only resolution path (tasks
 * resolve via their status). Enforces editor/owner RBAC (audited denial); both
 * directions are idempotent (a repeat keeps the current state). Persists the item
 * and records a success audit entry.
 */
export class ResolveReviewItemUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * `context` precedes `reopen` so this stays call-compatible with the resolve-only signature: a
   * 4-arg caller passing a `RequestContext` lands it in the context slot (not the flag), and `reopen`
   * defaults to a resolve.
   *
   * @param actorId - The acting user.
   * @param projectId - The tenant scope.
   * @param reviewItemId - The comment item to resolve or reopen.
   * @param context - Optional request origin for audit metadata.
   * @param reopen - When true, clears the resolution (reopens) instead of resolving.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    context?: RequestContext,
    reopen = false,
  ): Promise<Result<ResolveReviewItemResult, DomainError>> {
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
    if (item.isTask()) {
      return {
        success: false,
        error: new ReviewOperationInvalidError(`a task is ${reopen ? 'reopened' : 'resolved'} via its status`),
      };
    }
    // Resolution is a thread-level concept — only a root can be resolved, never a reply.
    if (!item.isRoot()) {
      return {
        success: false,
        error: new ReviewOperationInvalidError(`only a thread root can be ${reopen ? 'reopened' : 'resolved'}`),
      };
    }

    if (reopen) item.reopenAsComment();
    else item.resolveAsComment(actorId);
    await this.reviewCommentRepo.update(item);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: reopen ? AUDIT_REVIEW_REOPENED : AUDIT_REVIEW_RESOLVED,
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
