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
import { ValidationError } from '../../errors/common/validation-error';
import { ReviewItemNotFoundError } from '../../errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../errors/review/review-operation-invalid';
import { AUDIT_REVIEW_ASSIGNED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** Command to set (or clear) a task's assignee and optional due date. */
export interface AssignTaskCommand {
  /** The assignee's user id, or null to clear the assignment. */
  assigneeId: string | null;
  /** ISO due date, null to clear, or omitted to clear. */
  dueDate?: string | null;
}

/** Result of {@link AssignTaskUseCase.execute}. */
export interface AssignTaskResult {
  /** The updated task. */
  item: ReviewComment;
}

/**
 * Assigns a task to a user (or clears the assignment) and sets an optional due
 * date. Only a task-kind item may be assigned — a non-task is rejected via the
 * entity guard. Enforces editor/owner RBAC (audited denial) and records a success
 * audit entry.
 */
export class AssignTaskUseCase {
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
   * @param reviewItemId - The task to assign.
   * @param command - The assignee and optional due date.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    reviewItemId: ReviewCommentId,
    command: AssignTaskCommand,
    context?: RequestContext,
  ): Promise<Result<AssignTaskResult, DomainError>> {
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
    // The kind mismatch is the most fundamental error — a comment cannot be assigned
    // at all — so it takes precedence over assignee/due-date validation below.
    if (!item.isTask()) {
      return { success: false, error: new ReviewOperationInvalidError('only a task can be assigned') };
    }

    const assigneeId = command.assigneeId === null ? null : UserId.create(command.assigneeId);
    const dueDate = command.dueDate === null || command.dueDate === undefined ? null : new Date(command.dueDate);

    // Reject a due date that did not parse (e.g. "2026-02-30") so it never reaches the
    // DB as an Invalid Date and later blows up DTO serialization as an opaque 500.
    if (dueDate !== null && Number.isNaN(dueDate.getTime())) {
      return { success: false, error: new ValidationError('due date is not a valid date') };
    }

    // A task may only be assigned to a member of its project (FR-007). Reject a
    // non-member/nonexistent assignee rather than persisting a dangling assignment.
    if (assigneeId !== null) {
      const assigneeMembership = await this.projectMemberRepo.findByCompositeKey(projectId, assigneeId);
      if (assigneeMembership === null) {
        return { success: false, error: new ValidationError('assignee is not a member of this project') };
      }
    }

    try {
      item.assign(assigneeId, dueDate);
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
        action: AUDIT_REVIEW_ASSIGNED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { assigneeId: assigneeId?.value ?? null },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
