import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { RequestContext } from '../../types/request-context';
import { withOrigin } from '../audit-metadata';
import { randomUUID } from 'crypto';

/** Input describing a single governance audit event to record. */
export interface RecordAuditEventInput {
  /** Action identifier (e.g. `auth.signed_in`, `authz.denied`). */
  readonly action: string;
  /** The acting user. */
  readonly actorId: UserId;
  /** The kind of resource acted upon (e.g. `User`, `FileNode`). */
  readonly resourceType: string;
  /** The identity of the resource acted upon. */
  readonly resourceId: string;
  /** Project scope, or null for global/account-level actions. */
  readonly projectId?: ProjectId | null;
  /** Event-specific metadata (e.g. Before/after values). */
  readonly metadata?: Record<string, unknown>;
  /** Request origin, folded into `metadata.origin` when present. */
  readonly context?: RequestContext;
  /** Event time; defaults to now. */
  readonly now?: Date;
}

/**
 * Shared recorder for governance audit events (auth events and authorization
 * denials). Callers that need best-effort, non-blocking semantics (e.g. The auth
 * routes) invoke this off the response path and swallow/log failures themselves;
 * this use case simply persists the record.
 */
export class RecordAuditEventUseCase {
  /**
   * @param auditLogRepo - Repository for audit-log persistence.
   */
  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  /**
   * Builds and persists a governance audit record.
   *
   * @param input - The event to record.
   */
  async execute(input: RecordAuditEventInput): Promise<void> {
    const metadata = withOrigin(input.metadata ?? {}, input.context);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      input.actorId,
      input.projectId ?? null,
      input.action,
      input.resourceType,
      input.resourceId,
      input.now ?? new Date(),
      metadata,
    );

    await this.auditLogRepo.save(auditLog);
  }
}
