import { Project } from '../entities/project';
import { ProjectId } from '../value-objects/project-id';
import { UserId } from '../value-objects/user-id';

/**
 * Repository interface for managing Project persistence.
 * Handles storage and retrieval of Project entities by their identifiers.
 */
export interface ProjectRepository {
  /**
   * Finds a project by its unique identifier.
   * @param id - The unique identifier of the project
   * @returns The project if found, null otherwise
   */
  findById(id: ProjectId): Promise<Project | null>;

  /**
   * Finds all projects owned by a specific user.
   * @param ownerId - The unique identifier of the owner user
   * @returns An array of projects owned by the user
   */
  findByOwnerId(ownerId: UserId): Promise<Project[]>;

  /**
   * Persists a project entity (create or update).
   * @param project - The project entity to save
   */
  save(project: Project): Promise<void>;

  /**
   * Removes a project by its unique identifier.
   * @param id - The unique identifier of the project to delete
   */
  delete(id: ProjectId): Promise<void>;
}
