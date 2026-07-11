import { randomUUID } from 'crypto';
import { Result } from '../../types/result';
import { ReviewReaction } from '../../entities/review-reaction';
import { ReviewReactionId } from '../../value-objects/ids/review-reaction-id';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ReviewReactionRepository } from '../../ports/review/review-reaction.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/common/validation-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { requireProjectEditor } from './review-authorization';

/** Command to toggle an emoji reaction on a review item. */
export interface ReactToItemCommand {
  /** The normalized unicode-emoji key (allowlist-validated at the API boundary). */
  emoji: string;
}

/** Result of {@link ReactToItemUseCase.execute} — the item's reactions after the toggle. */
export interface ReactToItemResult {
  /** Every reaction currently attached to the target item. */
  reactions: ReviewReaction[];
}

/**
 * Toggles the caller's emoji reaction on a review item (idempotent add/remove).
 * Enforces editor/owner RBAC (audited denial) and a non-empty emoji, then returns
 * the item's reactions after the toggle. Reactions are not themselves audited.
 */
export class ReactToItemUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly reviewReactionRepo: ReviewReactionRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * @param actorId - The acting user.
   * @param projectId - The tenant scope.
   * @param reviewItemId - Root id of the thread receiving the reaction toggle.
   * @param command - The emoji to toggle.
   * @param context - Optional request origin for audit metadata (RBAC denial only).
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: ReactToItemCommand,
    context?: RequestContext,
  ): Promise<Result<ReactToItemResult, DomainError>> {
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
    if (command.emoji.length === 0) {
      return { success: false, error: new ValidationError('reaction emoji must be non-empty') };
    }

    const reaction = new ReviewReaction(
      ReviewReactionId.create(randomUUID()),
      item.id,
      actorId,
      command.emoji,
    );
    await this.reviewReactionRepo.toggle(reaction);

    const reactions = await this.reviewReactionRepo.listForItems([item.id]);
    return { success: true, value: { reactions } };
  }
}
