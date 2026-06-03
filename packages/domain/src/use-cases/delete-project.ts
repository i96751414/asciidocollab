import { AuditLog } from '../entities/audit-log';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { AuditLogId } from '../value-objects/audit-log-id';
import { ProjectRepository } from '../ports/project/project.repository';
import { ProjectMemberRepository } from '../ports/project/project-member.repository';
import { AuditLogRepository } from '../ports/admin/audit-log.repository';
import { ProjectFileStore } from '../ports/storage/project-file-store';
import { YjsStateStore } from '../ports/storage/yjs-state-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/**
 * Permanently deletes a project and all its associated data.
 * Only members with the `owner` role may delete a project.
 */
export class DeleteProjectUseCase {
  /** Creates a new DeleteProjectUseCase instance. */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly fileStore?: ProjectFileStore,
    private readonly yjsStateStore?: YjsStateStore,
  ) {}

  /** Permanently deletes a project after verifying the actor holds the owner role. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<void, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      return { success: false, error: new PermissionDeniedError() };
    }

    await this.auditLogRepo.save(
      new AuditLog(
        AuditLogId.create(randomUUID()),
        actorId,
        projectId,
        'project.deleted',
        'Project',
        projectId.value,
      ),
    );

    await this.projectRepo.delete(projectId);

    if (this.fileStore) {
      await this.fileStore.removeProject(projectId);
    }
    if (this.yjsStateStore) {
      await this.yjsStateStore.deleteAllForProject(projectId);
    }

    return { success: true, value: undefined };
  }
}
