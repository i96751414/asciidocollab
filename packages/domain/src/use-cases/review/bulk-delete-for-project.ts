import { Result } from '../../types/result';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/common/validation-error';
import { ReviewCountConflictError } from '../../errors/review/review-count-conflict';
import { AUDIT_REVIEW_PROJECT_CLEARED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectOwner } from './review-authorization';

/** Command to bulk-delete every review item across a project. */
export interface BulkDeleteForProjectCommand {
  /** Must be `true` to acknowledge the destructive intent. */
  confirm: true;
  /** Optional optimistic guard: the count the caller expects to remove. */
  expectedCount?: number;
}

/** Result of {@link BulkDeleteForProjectUseCase.execute}. */
export interface BulkDeleteForProjectResult {
  /** The number of items removed. */
  deleted: number;
}

/**
 * Deletes every review item across a whole project. Restricted to the project
 * OWNER (audited denial for anyone else), requires explicit confirmation, and
 * honors an optional optimistic `expectedCount` guard that rejects a mismatch.
 * Idempotent (a repeat removes 0). Records a success audit entry.
 */
export class BulkDeleteForProjectUseCase {
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
   * @param command - Confirmation and optional optimistic guard.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    command: BulkDeleteForProjectCommand,
    context?: RequestContext,
  ): Promise<Result<BulkDeleteForProjectResult, DomainError>> {
    const denial = await requireProjectOwner(
      this.projectMemberRepo,
      this.auditLogRepo,
      { actorId, projectId, resourceId: projectId.value, context },
      this.logger,
    );
    if (denial) return { success: false, error: denial };

    if (!command.confirm) {
      return { success: false, error: new ValidationError('bulk delete must be confirmed') };
    }

    if (command.expectedCount !== undefined) {
      const live = await this.reviewCommentRepo.countByProject(projectId);
      if (live !== command.expectedCount) {
        return { success: false, error: new ReviewCountConflictError(command.expectedCount, live) };
      }
    }

    const deleted = await this.reviewCommentRepo.deleteByProject(projectId);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_PROJECT_CLEARED,
        resourceType: 'ReviewComment',
        resourceId: projectId.value,
        metadata: { deleted },
        context,
      },
      this.logger,
    );
    return { success: true, value: { deleted } };
  }
}
