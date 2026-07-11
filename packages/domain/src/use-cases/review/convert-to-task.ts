import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewItemKind } from '../../constants/review';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_CONVERTED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Command to convert a review item between comment and task kinds. */
export interface ConvertToTaskCommand {
  /** The target kind: `task` promotes a comment; `comment` reverts a task. */
  kind: ReviewItemKind;
}

/** Result of {@link ConvertToTaskUseCase.execute}. */
export interface ConvertToTaskResult {
  /** The converted item. */
  item: ReviewComment;
}

/**
 * Converts a root review item between comment and task kinds. Promoting a comment
 * defaults the new task to `open`; reverting a task clears its status, assignee,
 * due date, and resolution stamp while preserving the thread, author, and anchor.
 * Enforces editor/owner RBAC (audited denial) and records a success audit entry.
 */
export class ConvertToTaskUseCase {
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
   * @param reviewItemId - Root id of the thread being switched between comment and task.
   * @param command - The target kind.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: ConvertToTaskCommand,
    context?: RequestContext,
  ): Promise<Result<ConvertToTaskResult, DomainError>> {
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
      if (command.kind === 'task') {
        item.convertToTask();
      } else {
        item.convertToComment();
      }
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
        action: AUDIT_REVIEW_CONVERTED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { kind: item.kind },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
