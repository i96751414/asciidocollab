import { AuditLog } from '../../src/entities/audit-log';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { AuditLogRepository } from '../../src/repositories/audit-log.repository';

/**
 *
 */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly storage = new Map<string, AuditLog>();

  /**
   *
   */
  async save(auditLog: AuditLog): Promise<void> {
    this.storage.set(auditLog.id.value, auditLog);
  }

  /**
   *
   */
  async findByProjectId(projectId: ProjectId): Promise<AuditLog[]> {
    return [...this.storage.values()].filter(
      (log) => log.projectId?.value === projectId.value,
    );
  }

  /**
   *
   */
  async findByUserId(userId: UserId): Promise<AuditLog[]> {
    return [...this.storage.values()].filter(
      (log) => log.userId.value === userId.value,
    );
  }

  /**
   *
   */
  async findAll(): Promise<AuditLog[]> {
    return [...this.storage.values()];
  }
}
