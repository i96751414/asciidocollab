import type { ProjectRenderConfigRepository } from '../../ports/project/project-render-config.repository';
import type { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import type { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import type { Logger } from '../../ports/observability/logger';
import type { UserId } from '../../value-objects/ids/user-id';
import type { ProjectId } from '../../value-objects/ids/project-id';
import type { RequestContext } from '../../types/request-context';
import type { Result } from '../../types/result';
import type { DomainError } from '../../errors/domain-error';
import { ProjectRenderConfig, type RenderConfigData } from '../../entities/project-render-config';
import { ProjectRenderConfigId } from '../../value-objects/ids/project-render-config-id';
import { ValidationError } from '../../errors/common/validation-error';
import { AUDIT_PROJECT_RENDER_CONFIG_UPDATED } from '../../audit-actions';
import { recordAuditSuccess } from '../audit-recording';
import { requireRenderConfigEditor, RENDER_CONFIG_RESOURCE_TYPE } from './render-config-authorization';
import { randomUUID } from 'node:crypto';

/**
 * Validates authorization and persists a project's render configuration (insert or update). Only a
 * project editor or owner may change it; the change is audited. The `config` payload MUST already be
 * structurally validated by the caller (the API validates option semantics via the shared schema).
 */
export class SaveProjectRenderConfigUseCase {
  /**
   * @param repo - The render-config repository.
   * @param projectMemberRepo - Membership lookup for the write authorization check.
   * @param auditLogRepo - Audit sink for the denial and success records.
   * @param logger - Optional observability sink for a swallowed audit failure.
   */
  constructor(
    private readonly repo: ProjectRenderConfigRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Executes the use case.
   *
   * @param actorId - The user changing the configuration.
   * @param projectId - The project whose configuration to write.
   * @param config - The boundary-validated render-config document to persist.
   * @param context - Optional request origin captured into the audit records.
   * @returns The saved record, a permission error, or a validation error.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    config: RenderConfigData,
    context?: RequestContext,
  ): Promise<Result<ProjectRenderConfig, DomainError>> {
    const denied = await requireRenderConfigEditor(
      this.projectMemberRepo,
      this.auditLogRepo,
      { actorId, projectId, context },
      this.logger,
    );
    if (denied) {
      return { success: false, error: denied };
    }

    let entity: ProjectRenderConfig;
    try {
      const existing = await this.repo.findByProjectId(projectId);
      const id = existing?.id ?? ProjectRenderConfigId.create(randomUUID());
      entity = new ProjectRenderConfig(id, projectId, config, existing?.timestamps);
    } catch (error) {
      if (error instanceof ValidationError) {
        return { success: false, error };
      }
      throw error;
    }

    await this.repo.save(entity);
    await recordAuditSuccess(
      this.auditLogRepo,
      {
        actorId,
        projectId,
        action: AUDIT_PROJECT_RENDER_CONFIG_UPDATED,
        resourceType: RENDER_CONFIG_RESOURCE_TYPE,
        resourceId: projectId.value,
        context,
      },
      this.logger,
    );
    return { success: true, value: entity };
  }
}
