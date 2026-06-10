import { AuditLogId } from '../value-objects/audit-log-id';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';

/**
 * Represents an auditable action performed by a user within a project.
 *
 * AuditLog entries provide a immutable record of security-relevant events.
 * The `metadata` field captures arbitrary key-value data that varies by
 * action and resource type.
 */
export class AuditLog {
  /** Creates a new AuditLog entry. */
  constructor(
    /** Unique identifier for this audit entry. */
    public readonly id: AuditLogId,
    /** The user who performed the action, or null once that user is deleted (SetNull). */
    public readonly userId: UserId | null,
    /** The project the action was performed in, or null for global actions. */
    public readonly projectId: ProjectId | null,
    /**
     * The type of action performed (e.g. 'project.created',
     *  'document.deleted').
     */
    public readonly action: string,
    /**
     * The kind of resource that was acted upon (e.g. 'project', 'document',
     *  'member').
     */
    public readonly resourceType: string,
    /** The identifier of the specific resource instance. */
    public readonly resourceId: string,
    /** Timestamp of when the action occurred. Defaults to the current time. */
    public readonly timestamp: Date = new Date(),
    /**
     * Arbitrary JSON-serialisable metadata providing additional context about
     *  the action. Defaults to an empty object.
     */
    public readonly metadata: Record<string, unknown> = {},
  ) {}
}
