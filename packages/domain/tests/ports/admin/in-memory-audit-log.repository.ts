import { AuditLog } from '../../../src/entities/audit-log';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { AuditLogRepository, AuditLogFilters, PaginationOptions, PagedResult } from '../../../src/ports/admin/audit-log.repository';

/** In-memory implementation of AuditLogRepository for use in tests. */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly storage = new Map<string, AuditLog>();

  /** Stores an audit log entry in memory. */
  async save(auditLog: AuditLog): Promise<void> {
    this.storage.set(auditLog.id.value, auditLog);
  }

  /** Returns all audit log entries matching the given project ID. */
  async findByProjectId(projectId: ProjectId): Promise<AuditLog[]> {
    return [...this.storage.values()].filter(
      (log) => log.projectId?.value === projectId.value,
    );
  }

  /** Returns all audit log entries matching the given user ID. */
  async findByUserId(userId: UserId): Promise<AuditLog[]> {
    return [...this.storage.values()].filter(
      (log) => log.userId.value === userId.value,
    );
  }

  /** Returns all stored audit log entries. */
  async findAll(): Promise<AuditLog[]> {
    return [...this.storage.values()];
  }

  /** Returns filtered and paginated audit log entries. */
  async findWithFilters(filters: AuditLogFilters, pagination: PaginationOptions): Promise<PagedResult<AuditLog>> {
    let items = [...this.storage.values()];

    if (filters.fromDate) {
      items = items.filter((log) => log.timestamp >= filters.fromDate!);
    }
    if (filters.toDate) {
      items = items.filter((log) => log.timestamp <= filters.toDate!);
    }
    if (filters.userId) {
      items = items.filter((log) => log.userId.value === filters.userId);
    }
    if (filters.actionType) {
      items = items.filter((log) => log.action === filters.actionType);
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = items.length;
    const start = (pagination.page - 1) * pagination.limit;
    return {
      items: items.slice(start, start + pagination.limit),
      total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  /** Returns distinct action type strings from all stored entries. */
  async findDistinctActionTypes(): Promise<string[]> {
    return [...new Set([...this.storage.values()].map((log) => log.action))];
  }
}
