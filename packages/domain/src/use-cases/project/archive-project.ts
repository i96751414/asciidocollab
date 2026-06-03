import { ProjectId } from '../../value-objects/project-id';
import { UserId } from '../../value-objects/user-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/audit-log-id';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { ProjectNotFoundError } from '../../errors/project-not-found';
import { ProjectAlreadyArchivedError } from '../../errors/project-already-archived';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/**
 * Result returned on successful project archival.
 */
export interface ArchiveProjectResult {
  /** The archive timestamp. */
  archivedAt: Date;
}

/**
 * Archives a project (soft delete).
 * Only the project owner can archive a project.
 */
export class ArchiveProjectUseCase {
  /**
   * Creates a new ArchiveProjectUseCase.
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
   * Archives a project.
   *
   * @param actorId - The owner performing the archive.
   * @param projectId - The project to archive.
   * @returns The archive timestamp on success.
   * On failure returns `PermissionDeniedError` if the caller is not the owner,
   * `ProjectNotFoundError` if the project does not exist, or
   * `ProjectAlreadyArchivedError` if the project is already archived.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<ArchiveProjectResult, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      return { success: false, error: new PermissionDeniedError() };
    }

    if (project.archivedAt !== null) {
      return { success: false, error: new ProjectAlreadyArchivedError() };
    }

    const archiveTimestamp = new Date();
    await this.projectRepo.archive(projectId, archiveTimestamp);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'project.archived',
      'Project',
      projectId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: { archivedAt: archiveTimestamp } };
  }
}
