import { Project } from '../../entities/project';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectName } from '../../value-objects/project/project-name';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ProjectNotFoundError } from '../../errors/project/project-not-found';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { Logger } from '../../ports/observability/logger';

/**
 * Input data for updating a project.
 */
export interface UpdateProjectInput {
  /** The new project name. */
  name?: string;
  /** The new project description. */
  description?: string | null;
  /** The new project tags. */
  tags?: string[];
  /**
   * The new document/spellcheck language, or null to clear it. Validated against
   * the supported set by the Project entity (an unsupported code throws).
   */
  language?: string | null;
}

/**
 * Updates project details (name, description, tags).
 * Requires the caller to be an owner of the project.
 */
export class UpdateProjectUseCase {
  /**
   * Creates a new UpdateProjectUseCase.
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
   * Updates project details.
   *
   * @param actorId - The owner performing the update.
   * @param projectId - The project to update.
   * @param input - The update data.
   * @returns The updated project.
   * On failure returns `PermissionDeniedError` if the caller is not an owner,
   * or `ProjectNotFoundError` if the project does not exist.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: UpdateProjectInput,
    context?: RequestContext,
  ): Promise<Result<Project, DomainError>> {
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

    // Capture before-values to record what actually changed (FR-016).
    const before = {
      name: project.name.value,
      description: project.description,
      tags: [...project.tags],
      language: project.language,
    };

    // Update project fields using the entity's update method
    project.update({
      name: input.name === undefined ? undefined : ProjectName.create(input.name),
      description: input.description === undefined ? undefined : input.description,
      tags: input.tags,
      language: input.language,
    });

    await this.projectRepo.save(project);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (project.name.value !== before.name) {
      changes.name = { from: before.name, to: project.name.value };
    }
    if (project.description !== before.description) {
      changes.description = { from: before.description, to: project.description };
    }
    const afterTags = [...project.tags];
    if (
      afterTags.length !== before.tags.length ||
      afterTags.some((tag, index) => tag !== before.tags[index])
    ) {
      changes.tags = { from: before.tags, to: afterTags };
    }
    if (project.language !== before.language) {
      changes.language = { from: before.language, to: project.language };
    }

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: 'project.updated',
      resourceType: 'Project',
      resourceId: projectId.value,
      metadata: { changes },
      context,
    }, this.logger);

    return { success: true, value: project };
  }
}
