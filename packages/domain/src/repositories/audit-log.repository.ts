import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';

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
}
