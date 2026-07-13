import type { ProjectRenderConfig } from '../../entities/project-render-config';
import type { ProjectId } from '../../value-objects/ids/project-id';

/** Persistence port for a project's render configuration (one record per project). */
export interface ProjectRenderConfigRepository {
  /**
   * Finds the render configuration for the given project, or null if none exists.
   *
   * @param projectId - The project whose configuration to look up.
   * @returns The configuration record, or null if not found.
   */
  findByProjectId(projectId: ProjectId): Promise<ProjectRenderConfig | null>;
  /**
   * Persists the given render-config record (insert or update, keyed by project).
   *
   * @param config - The render-config record to save.
   * @returns A promise that resolves when the save is complete.
   */
  save(config: ProjectRenderConfig): Promise<void>;
}
