import { AuditLog } from '../../../src/entities/audit-log';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { AuditLogRepository } from '../../../src/ports/admin/audit-log.repository';

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
}
