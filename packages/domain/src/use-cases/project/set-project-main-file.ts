import { Project } from '../../entities/project';
import { ProjectId } from '../../value-objects/project-id';
import { UserId } from '../../value-objects/user-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { ProjectNotFoundError } from '../../errors/project-not-found';
import { MainFileNotFoundError } from '../../errors/main-file-not-found';
import { MainFileNotAsciidocError } from '../../errors/main-file-not-asciidoc';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { Logger } from '../../ports/observability/logger';

/** Input for {@link SetProjectMainFileUseCase}; null clears the configuration. */
export interface SetProjectMainFileInput {
  /** The file node to designate as the project's main file, or null to clear. */
  mainFileNodeId: string | null;
}

/**
 * Sets or clears the project's configured main AsciiDoc file (FR-045).
 *
 * Authorization is enforced **in the use case** (mirroring `UpdateProjectUseCase`):
 * the caller must be a project editor or owner, else a `PermissionDeniedError`
 * is returned and an authorization-denial audit entry is recorded
 * (security_constitution: permission checks live in use cases, not routes).
 */
export class SetProjectMainFileUseCase {
  /**
   * @param projectRepo - Loads and persists the project.
   * @param projectMemberRepo - Resolves the caller's project membership for RBAC.
   * @param fileNodeRepo - Validates the designated main-file node.
   * @param auditLogRepo - Records authorization-denial and success audit entries.
   * @param logger - Optional logger for audit-write failures.
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Set or clear the project's main AsciiDoc file.
   *
   * @param actorId - The authenticated caller.
   * @param projectId - The project to configure.
   * @param input - The main-file node id, or null to clear.
   * @param context - Optional request origin for audit metadata.
   * @returns The updated project, or a typed domain error.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: SetProjectMainFileInput,
    context?: RequestContext,
  ): Promise<Result<Project, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    // Authorization: project-edit permission (editor or owner) — enforced here.
    const membership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    const role = membership?.role.value;
    const authorized = role === 'owner' || role === 'editor';
    if (!authorized) {
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

    if (input.mainFileNodeId === null) {
      project.setMainFile(null);
    } else {
      const node = await this.fileNodeRepo.findById(FileNodeId.create(input.mainFileNodeId));
      if (!node || node.projectId.value !== projectId.value) {
        return { success: false, error: new MainFileNotFoundError(input.mainFileNodeId) };
      }
      if (node.type.value !== 'file' || !node.name.toLowerCase().endsWith('.adoc')) {
        return { success: false, error: new MainFileNotAsciidocError(input.mainFileNodeId) };
      }
      project.setMainFile(node.id);
    }

    await this.projectRepo.save(project);

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: 'project.mainFileSet',
      resourceType: 'Project',
      resourceId: projectId.value,
      metadata: { mainFileNodeId: input.mainFileNodeId },
      context,
    }, this.logger);

    return { success: true, value: project };
  }
}
