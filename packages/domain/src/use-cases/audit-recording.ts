import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/ids/audit-log-id';
import { UserId } from '../value-objects/ids/user-id';
import { ProjectId } from '../value-objects/ids/project-id';
import { AuditLogRepository } from '../ports/admin/audit-log.repository';
import { Logger } from '../ports/observability/logger';
import { RequestContext } from '../types/request-context';
import { withOrigin } from './audit-metadata';
import { AUDIT_AUTHZ_DENIED } from '../audit-actions';
import { randomUUID } from 'crypto';

/**
 * Best-effort persistence of an audit record: the write must never fail the
 * surrounding operation (e.g. It runs after an already-committed, non-retryable
 * change), but its failure must remain observable rather than silently dropped
 * Swallows the error and reports it via the optional logger.
 *
 * Takes a `build` factory rather than a prebuilt record so that **both** building
 * the record (id/value-object validation, metadata shaping) and saving it are
 * inside the best-effort boundary — a construction-time throw can no longer
 * escape and convert the business outcome into a failure.
 *
 * @param repo - Audit-log repository.
 * @param build - Factory that constructs the record to persist.
 * @param logger - Optional observability sink for the swallowed failure.
 */
export async function saveAuditBestEffort(
  repo: AuditLogRepository,
  build: () => AuditLog,
  logger?: Logger,
): Promise<void> {
  try {
    await repo.save(build());
  } catch (error) {
    logger?.warn('failed to record audit event', { error });
  }
}

/** Describes a successful, auditable governance action to record. */
export interface AuditSuccessRecord {
  /** The user who performed the action, or null for system actions. */
  readonly actorId: UserId | null;
  /** Project scope, or null for global actions. */
  readonly projectId: ProjectId | null;
  /** The action type (e.g. `file.created`, `auth.registered`). */
  readonly action: string;
  /** The kind of resource acted upon (e.g. `FileNode`, `Project`, `User`). */
  readonly resourceType: string;
  /** The id of the resource acted upon. */
  readonly resourceId: string;
  /** Action-specific metadata; the request origin is merged in automatically. */
  readonly metadata?: Record<string, unknown>;
  /** Request origin, captured into the audit metadata. */
  readonly context?: RequestContext;
}

/**
 * Best-effort record of a successful governance action. Centralizes the
 * success-record shape — id generation, timestamp, and origin-metadata merge —
 * so the use cases that audit a completed mutation don't each hand-roll it, and
 * so a record failure can never convert an already-committed success into an error
 * The success-path counterpart to {@link recordAuthorizationDenial}.
 *
 * @param repo - Audit-log repository.
 * @param record - The action to record.
 * @param logger - Optional observability sink for a swallowed failure.
 */
export async function recordAuditSuccess(
  repo: AuditLogRepository,
  record: AuditSuccessRecord,
  logger?: Logger,
): Promise<void> {
  await saveAuditBestEffort(
    repo,
    () => new AuditLog(
      AuditLogId.create(randomUUID()),
      record.actorId,
      record.projectId,
      record.action,
      record.resourceType,
      record.resourceId,
      new Date(),
      withOrigin(record.metadata ?? {}, record.context),
    ),
    logger,
  );
}

/** Describes an authorization denial to record (`authz.denied`). */
export interface AuthorizationDenial {
  /** The user whose action was denied. */
  readonly actorId: UserId;
  /** Project scope, or null. */
  readonly projectId: ProjectId | null;
  /** The kind of resource access was denied to (e.g. `FileNode`, `Project`). */
  readonly resourceType: string;
  /** The id of the resource access was denied to. */
  readonly resourceId: string;
  /** Short machine-readable reason (e.g. `not_a_project_member`). */
  readonly reason: string;
  /** Request origin, captured into the audit metadata. */
  readonly context?: RequestContext;
}

/**
 * Best-effort record of an `authz.denied` governance event. Centralizes the
 * denial-record shape so the ~dozen authorization boundaries don't hand-roll it,
 * and so a denial-record failure can never convert a clean 403 into a 500.
 *
 * @param repo - Audit-log repository.
 * @param denial - The denial details.
 * @param logger - Optional observability sink.
 */
export async function recordAuthorizationDenial(
  repo: AuditLogRepository,
  denial: AuthorizationDenial,
  logger?: Logger,
): Promise<void> {
  await saveAuditBestEffort(
    repo,
    () => new AuditLog(
      AuditLogId.create(randomUUID()),
      denial.actorId,
      denial.projectId,
      AUDIT_AUTHZ_DENIED,
      denial.resourceType,
      denial.resourceId,
      new Date(),
      withOrigin({ reason: denial.reason }, denial.context),
    ),
    logger,
  );
}
