import { GitRepository } from '../../entities/git-repository';
import { GitRepositoryId } from '../../value-objects/ids/git-repository-id';
import { ProjectId } from '../../value-objects/ids/project-id';

/**
 * Repository interface for managing GitRepository persistence.
 * Handles storage and retrieval of remote Git repository configurations per project.
 */
export interface GitRepositoryRepository {
  /**
   * Finds a git repository configuration by its unique identifier.
   * 
   * @param id - The unique identifier of the git repository.
   * @returns The git repository if found, null otherwise.
   */
  findById(id: GitRepositoryId): Promise<GitRepository | null>;

  /**
   * Finds a git repository configuration associated with a project.
   * 
   * @param projectId - The unique identifier of the project.
   * @returns The git repository if found, null otherwise.
   */
  findByProjectId(projectId: ProjectId): Promise<GitRepository | null>;

  /**
   * Persists a git repository entity (create or update).
   * 
   * @param gitRepository - The git repository entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(gitRepository: GitRepository): Promise<void>;

  /**
   * Removes a git repository configuration by its unique identifier.
   * 
   * @param id - The unique identifier of the git repository to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: GitRepositoryId): Promise<void>;
}
