import { Project } from '../entities/project';
import { ProjectId } from '../value-objects/project-id';
import { UserId } from '../value-objects/user-id';
import { ProjectName } from '../value-objects/project-name';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditLog } from '../entities/audit-log';
import { AuditLogId } from '../value-objects/audit-log-id';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

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
}

/**
 * Updates project details (name, description, tags).
 * Requires the caller to be an administrator of the project.
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
  ) {}

  /**
   * Updates project details.
   *
   * @param actorId - The administrator performing the update.
   * @param projectId - The project to update.
   * @param input - The update data.
   * @returns The updated project.
   * On failure returns `PermissionDeniedError` if the caller is not an administrator,
   * or `ProjectNotFoundError` if the project does not exist.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<Result<Project, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!callerMembership || callerMembership.role.value !== 'administrator') {
      return { success: false, error: new PermissionDeniedError() };
    }

    // Update project fields using the entity's update method
    project.update({
      name: input.name === undefined ? undefined : ProjectName.create(input.name),
      description: input.description === undefined ? undefined : input.description,
      tags: input.tags,
    });

    await this.projectRepo.save(project);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'project.updated',
      'Project',
      projectId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return { success: true, value: project };
  }
}
