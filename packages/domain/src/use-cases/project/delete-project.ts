import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { YjsStateStore } from '../../ports/storage/yjs-state-store';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ProjectNotFoundError } from '../../errors/project/project-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { Logger } from '../../ports/observability/logger';

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
    private readonly logger?: Logger,
  ) {}

  /** Permanently deletes a project after verifying the actor holds the owner role. */
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

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: 'project.deleted',
      resourceType: 'Project',
      resourceId: projectId.value,
      context,
    }, this.logger);

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
