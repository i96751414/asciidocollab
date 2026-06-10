import { ProjectId } from '../../value-objects/project-id';
import { UserId } from '../../value-objects/user-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { ProjectNotFoundError } from '../../errors/project-not-found';
import { ProjectNotArchivedError } from '../../errors/project-not-archived';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { Logger } from '../../ports/observability/logger';

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
    private readonly logger?: Logger,
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
    context?: RequestContext,
  ): Promise<Result<void, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      await recordAuthorizationDenial(this.auditLogRepo, {
        actorId,
        projectId,
        resourceType: 'Project',
        resourceId: projectId.value,
        reason: 'not_authorized',
        context,
      }, this.logger);
      return { success: false, error: new PermissionDeniedError() };
    }

    if (project.archivedAt === null) {
      return { success: false, error: new ProjectNotArchivedError() };
    }

    await this.projectRepo.restore(projectId);

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: 'project.restored',
      resourceType: 'Project',
      resourceId: projectId.value,
      context,
    }, this.logger);

    return { success: true, value: undefined };
  }
}
