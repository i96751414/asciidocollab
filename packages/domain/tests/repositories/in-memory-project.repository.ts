import { Project } from '../../src/entities/project';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectRepository } from '../../src/repositories/project.repository';

/**
 *
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly storage = new Map<string, Project>();

  /**
   *
   */
  async findById(id: ProjectId): Promise<Project | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   *
   */
  async findByOwnerId(ownerId: UserId): Promise<Project[]> {
    return [...this.storage.values()].filter(
      (p) => p.ownerId.value === ownerId.value,
    );
  }

  /**
   *
   */
  async save(project: Project): Promise<void> {
    this.storage.set(project.id.value, project);
  }

  /**
   *
   */
  async delete(id: ProjectId): Promise<void> {
    this.storage.delete(id.value);
  }
}
