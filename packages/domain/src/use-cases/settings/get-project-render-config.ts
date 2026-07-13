import type { ProjectRenderConfigRepository } from '../../ports/project/project-render-config.repository';
import type { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import type { ProjectRenderConfig } from '../../entities/project-render-config';
import type { UserId } from '../../value-objects/ids/user-id';
import type { ProjectId } from '../../value-objects/ids/project-id';
import type { Result } from '../../types/result';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { requireRenderConfigMember } from './render-config-authorization';

/**
 * Returns a project's saved render configuration, or null when none has been set (the caller then
 * treats it as the empty configuration). Any project member may read it.
 */
export class GetProjectRenderConfigUseCase {
  /**
   * @param repo - The render-config repository.
   * @param projectMemberRepo - Membership lookup for the read authorization check.
   */
  constructor(
    private readonly repo: ProjectRenderConfigRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
  ) {}

  /**
   * Executes the use case.
   *
   * @param actorId - The user requesting the configuration.
   * @param projectId - The project whose configuration to read.
   * @returns The saved configuration (or null), or a permission error when the caller is not a member.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<ProjectRenderConfig | null, PermissionDeniedError>> {
    const denied = await requireRenderConfigMember(this.projectMemberRepo, projectId, actorId);
    if (denied) {
      return { success: false, error: denied };
    }
    const config = await this.repo.findByProjectId(projectId);
    return { success: true, value: config };
  }
}
