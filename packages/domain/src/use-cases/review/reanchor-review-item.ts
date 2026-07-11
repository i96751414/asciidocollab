import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewAnchor, AnchorQuote } from '../../value-objects/review/review-anchor';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { AnchorInvalidError } from '../../errors/review/anchor-invalid';
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_REANCHORED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** The new passage anchor supplied when reattaching a root item. */
export interface ReanchorAnchorCommand {
  /** Decoded Yjs RelativePosition pair bytes, or null. */
  relPos: Uint8Array | null;
  /** Text-quote selector; `exact` must be non-empty. */
  quote: AnchorQuote;
  /** 1-based line hint, or null. */
  lineHint: number | null;
  /** Enclosing section symbol id, or null. */
  sectionId: string | null;
}

/** Command to manually reattach a root review item to a new passage. */
export interface ReanchorReviewItemCommand {
  /** The new anchor to apply. */
  anchor: ReanchorAnchorCommand;
}

/** Result of {@link ReanchorReviewItemUseCase.execute}. */
export interface ReanchorReviewItemResult {
  /** The reanchored, now-`located` item. */
  item: ReviewComment;
}

/**
 * Manually reattaches a root review item to a new passage, returning its anchor
 * to `located` (recovering a section-pinned or detached item). Enforces
 * editor/owner RBAC (audited denial) and a valid anchor (non-empty passage);
 * replies have no anchor. Persists the item and records a success audit entry.
 */
export class ReanchorReviewItemUseCase {
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
   * @param reviewItemId - The root item to reanchor.
   * @param command - The new anchor.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: ReanchorReviewItemCommand,
    context?: RequestContext,
  ): Promise<Result<ReanchorReviewItemResult, DomainError>> {
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

    if (command.anchor.quote.exact.trim().length === 0) {
      return { success: false, error: new AnchorInvalidError('anchor quote.exact is required') };
    }

    const anchor = new ReviewAnchor(
      command.anchor.relPos,
      command.anchor.quote,
      command.anchor.lineHint,
      command.anchor.sectionId,
      'located',
    );

    try {
      item.reanchor(anchor);
    } catch (error) {
      if (error instanceof ReviewOperationInvalidError) {
        return { success: false, error };
      }
      throw error;
    }

    await this.reviewCommentRepo.update(item);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_REANCHORED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { documentId: item.documentId.value, state: item.anchor?.state },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
