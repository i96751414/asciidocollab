import { AuditLog } from '../../entities/audit-log';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';

/** Filters for querying audit log entries. */
export interface AuditLogFilters {
  /** Inclusive start of the date range filter. */
  fromDate?: Date;
  /** Inclusive end of the date range filter. */
  toDate?: Date;
  /** Filter by actor user ID. */
  userId?: string;
  /** Filter by action type string. */
  actionType?: string;
}

/** Pagination options for paged queries. */
export interface PaginationOptions {
  /** 1-based page number. */
  page: number;
  /** Maximum items per page. */
  limit: number;
}

/** Paged result wrapper. */
export interface PagedResult<T> {
  /** The items on the current page. */
  items: T[];
  /** Total item count across all pages. */
  total: number;
  /** Current page number. */
  page: number;
  /** Results-per-page limit. */
  limit: number;
}

/**
 * Repository interface for managing AuditLog persistence.
 * Handles storage and retrieval of auditable action records across projects.
 */
export interface AuditLogRepository {
  /**
   * Persists an audit log entry.
   *
   * @param auditLog - The audit log entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(auditLog: AuditLog): Promise<void>;

  /**
   * Finds all audit log entries for a given project.
   *
   * @param projectId - The unique identifier of the project.
   * @returns An array of audit log entries for the project.
   */
  findByProjectId(projectId: ProjectId): Promise<AuditLog[]>;

  /**
   * Finds all audit log entries associated with a given user.
   *
   * @param userId - The unique identifier of the user.
   * @returns An array of audit log entries for the user.
   */
  findByUserId(userId: UserId): Promise<AuditLog[]>;

  /**
   * Retrieves all audit log entries.
   *
   * @returns An array of all audit log entries.
   */
  findAll(): Promise<AuditLog[]>;

  /**
   * Finds audit log entries matching the given filters with pagination.
   *
   * @param filters - Optional date, user, and action type filters.
   * @param pagination - Page and limit options.
   * @returns A paged result of matching audit log entries.
   */
  findWithFilters(filters: AuditLogFilters, pagination: PaginationOptions): Promise<PagedResult<AuditLog>>;

  /**
   * Returns the distinct action type strings present in the audit log.
   *
   * @returns An array of unique action type strings.
   */
  findDistinctActionTypes(): Promise<string[]>;
}
