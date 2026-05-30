import { ProjectId } from '../value-objects/project-id';
import { UserId } from '../value-objects/user-id';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/audit-log-id';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { ProjectNotArchivedError } from '../errors/project-not-archived';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/**
 * Restores an archived project.
 * Only the project owner can restore a project.
 */
export class RestoreProjectUseCase {
  /**
   * Creates a new RestoreProjectUseCase.
   *
   * @param projectRepo - The project repository.
   * @param projectMemberRepo - The project member repository.
   * @param auditLogRepo - The audit log repository.
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Restores an archived project.
   *
   * @param actorId - The owner performing the restore.
   * @param projectId - The project to restore.
   * @returns Void on success.
   * On failure returns `PermissionDeniedError` if the caller is not the owner,
   * `ProjectNotFoundError` if the project does not exist, or
   * `ProjectNotArchivedError` if the project is not archived.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<void, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    if (!project.ownerId.equals(actorId)) {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (project.archivedAt === null) {
      return { success: false, error: new ProjectNotArchivedError() };
    }

    await this.projectRepo.restore(projectId);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'project.restored',
      'Project',
      projectId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: undefined };
  }
}
