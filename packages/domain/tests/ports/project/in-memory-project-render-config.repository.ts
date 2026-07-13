import type { ProjectRenderConfig } from '../../../src/entities/project-render-config';
import type { ProjectId } from '../../../src/value-objects/ids/project-id';
import type { ProjectRenderConfigRepository } from '../../../src/ports/project/project-render-config.repository';

export class InMemoryProjectRenderConfigRepository implements ProjectRenderConfigRepository {
  private readonly store = new Map<string, ProjectRenderConfig>();

  async findByProjectId(projectId: ProjectId): Promise<ProjectRenderConfig | null> {
    return this.store.get(projectId.value) ?? null;
  }

  async save(config: ProjectRenderConfig): Promise<void> {
    this.store.set(config.projectId.value, config);
  }
}
