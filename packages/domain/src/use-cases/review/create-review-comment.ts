import { randomUUID } from 'crypto';
import { Result } from '../../types/result';
import { ReviewComment } from '../../entities/review-comment';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { DocumentId } from '../../value-objects/ids/document-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ReviewAnchor, AnchorQuote } from '../../value-objects/review/review-anchor';
import { ReviewItemKind, REVIEW_BODY_MAX_LEN } from '../../constants/review';
import { ReviewCommentRepository } from '../../ports/review/review-comment.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { DomainError } from '../../errors/domain-error';
import { ValidationError } from '../../errors/common/validation-error';
import { AnchorInvalidError } from '../../errors/review/anchor-invalid';
import { AUDIT_REVIEW_ITEM_CREATED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireProjectEditor } from './review-authorization';

/** The passage anchor supplied when creating a root item (already boundary-decoded). */
export interface CreateAnchorCommand {
  /** Decoded Yjs RelativePosition pair bytes, or null. */
  relPos: Uint8Array | null;
  /** Text-quote selector; `exact` must be non-empty. */
  quote: AnchorQuote;
  /** 1-based line hint, or null. */
  lineHint: number | null;
  /** Enclosing section symbol id, or null. */
  sectionId: string | null;
}

/** Command to create a root review comment or task. */
export interface CreateReviewItemCommand {
  /** Whether to create a comment or a task. */
  kind: ReviewItemKind;
  /** The body text. */
  body: string;
  /** The passage anchor. */
  anchor: CreateAnchorCommand;
}

/** Result of {@link CreateReviewCommentUseCase.execute}. */
export interface CreateReviewItemResult {
  /** The newly created root item. */
  item: ReviewComment;
}

/**
 * Creates a root comment or task on a document passage. Enforces editor/owner
 * RBAC (audited denial), a non-empty body within {@link REVIEW_BODY_MAX_LEN}, and
 * a valid anchor; persists the item and records a success audit entry.
 */
export class CreateReviewCommentUseCase {
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
   * @param documentId - The document the item attaches to.
   * @param command - The item to create.
   * @param context - Optional request origin for audit metadata.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    documentId: DocumentId,
    command: CreateReviewItemCommand,
    context?: RequestContext,
  ): Promise<Result<CreateReviewItemResult, DomainError>> {
    const denial = await requireProjectEditor(
      this.projectMemberRepo,
      this.auditLogRepo,
      { actorId, projectId, resourceId: 'new', context },
      this.logger,
    );
    if (denial) return { success: false, error: denial };

    const body = command.body.trim();
    if (body.length === 0) {
      return { success: false, error: new ValidationError('review body must be non-empty') };
    }
    if (body.length > REVIEW_BODY_MAX_LEN) {
      return { success: false, error: new ValidationError(`review body exceeds ${REVIEW_BODY_MAX_LEN} characters`) };
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
    const item = new ReviewComment(
      ReviewCommentId.create(randomUUID()),
      projectId,
      documentId,
      null,
      command.kind,
      body,
      actorId,
      command.kind === 'task' ? 'open' : null,
      null,
      null,
      null,
      null,
      anchor,
    );

    await this.reviewCommentRepo.create(item);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_REVIEW_ITEM_CREATED,
        resourceType: 'ReviewComment',
        resourceId: item.id.value,
        metadata: { kind: item.kind, documentId: documentId.value },
        context,
      },
      this.logger,
    );
    return { success: true, value: { item } };
  }
}
