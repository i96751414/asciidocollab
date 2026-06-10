import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { Role } from '../../value-objects/role';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { ProjectNotFoundError } from '../../errors/project-not-found';
import { CannotRemoveLastOwnerError } from '../../errors/cannot-remove-last-owner';
import { MemberNotFoundError } from '../../errors/member-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';

/**
 * Changes the role of a project member.
 *
 * Authorization rules:
 * - Only owners may change roles.
 * - The last owner cannot be demoted (CannotRemoveLastOwnerError).
 */
export class ChangeMemberRoleUseCase {
  /** Creates a new ChangeMemberRoleUseCase instance. */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /** Changes the role of a project member, enforcing owner-only authorization. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    targetUserId: UserId,
    newRole: Role,
    context?: RequestContext,
  ): Promise<Result<void, DomainError>> {
    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (callerMembership?.role.value !== 'owner') {
      await recordAuthorizationDenial(
        this.auditLogRepo,
        {
          actorId,
          projectId,
          resourceType: 'ProjectMember',
          resourceId: targetUserId.value,
          reason: 'not_an_owner',
          context,
        },
        this.logger,
      );
      return { success: false, error: new PermissionDeniedError() };
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const targetMembership = await this.projectMemberRepo.findByCompositeKey(projectId, targetUserId);
    if (!targetMembership) {
      return { success: false, error: new MemberNotFoundError(projectId.value, targetUserId.value) };
    }

    // Guard: cannot demote the last owner
    if (targetMembership.role.value === 'owner' && newRole.value !== 'owner') {
      const members = await this.projectMemberRepo.findByProjectId(projectId);
      const ownerCount = members.filter((m) => m.role.value === 'owner').length;
      if (ownerCount <= 1) {
        await recordAuthorizationDenial(
          this.auditLogRepo,
          {
            actorId,
            projectId,
            resourceType: 'ProjectMember',
            resourceId: targetUserId.value,
            reason: 'last_owner',
            context,
          },
          this.logger,
        );
        return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
      }
    }

    const previousRole = targetMembership.role.value;

    await this.projectMemberRepo.updateRole(projectId, targetUserId, newRole);

    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: 'member.roleChanged',
        resourceType: 'ProjectMember',
        resourceId: targetUserId.value,
        metadata: { previousRole, newRole: newRole.value },
        context,
      },
      this.logger,
    );

    return { success: true, value: undefined };
  }
}
