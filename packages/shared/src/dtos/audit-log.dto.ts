/** Single audit log entry returned by the API. */
export interface AuditLogDto {
  /** Unique identifier of the audit log entry. */
  id: string;
  /** ID of the user who performed the action, or null for system events. */
  userId: string | null;
  /** Display name of the actor, or null for system events. */
  actorDisplayName: string | null;
  /** ID of the affected project, or null for global events. */
  projectId: string | null;
  /** Action type string (e.g. "USER_LOGIN", "FILE_RENAMED"). */
  action: string;
  /** Affected resource type (e.g. "USER", "FILE"). */
  resourceType: string;
  /** Identifier of the affected resource instance. */
  resourceId: string;
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string;
  /** Arbitrary additional context for the action. */
  metadata: Record<string, unknown>;
}

/** Paged list of audit log entries. */
export interface AuditLogPageDto {
  /** The audit log entries on this page. */
  items: AuditLogDto[];
  /** Total number of matching entries across all pages. */
  total: number;
  /** Current page number (1-based). */
  page: number;
  /** Maximum entries per page. */
  limit: number;
}
