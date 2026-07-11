import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewItemStatus } from '../../constants/review';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_STATUS_CHANGED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Command to set a task's lifecycle status. */
export interface SetTaskStatusCommand {
  /** The target status. */
  status: ReviewItemStatus;
}

/** Result of {@link SetTaskStatusUseCase.execute}. */
export interface SetTaskStatusResult {
  /** The updated task. */
  item: ReviewComment;
}

/**
 * Sets a task's lifecycle status — the sole resolution path for tasks. A
 * resolved/wontfix status stamps the resolver and resolution time; reopening
 * clears the stamp. Only a task-kind item has a status; a non-task is rejected via
 * the entity guard. Enforces editor/owner RBAC (audited denial) and records a
 * success audit entry.
 */
export class SetTaskStatusUseCase {
  /** Injects the repositories (and optional logger) this use case depends on. */
  constructor(
    private readonly reviewCommentRepo: ReviewCommentRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * @param actorId - The acting user (recorded as resolver when the status resolves the task).
   * @param projectId - The tenant scope.
   * @param reviewItemId - The task to update.
   * @param command - The target status.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: SetTaskStatusCommand,
    context?: RequestContext,
  ): Promise<Result<SetTaskStatusResult, DomainError>> {
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

    try {
      item.setStatus(command.status, actorId);
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
        action: AUDIT_REVIEW_STATUS_CHANGED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { status: command.status },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
