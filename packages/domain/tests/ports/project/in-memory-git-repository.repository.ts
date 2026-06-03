import { GitRepository } from '../../../src/entities/git-repository';
import { GitRepositoryId } from '../../../src/value-objects/git-repository-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { GitRepositoryRepository } from '../../../src/ports/project/git-repository.repository';

/** In-memory implementation of GitRepositoryRepository for use in tests. */
export class InMemoryGitRepositoryRepository implements GitRepositoryRepository {
  private readonly storage = new Map<string, GitRepository>();

  /** Returns the git repository with the given ID, or null if not found. */
  async findById(id: GitRepositoryId): Promise<GitRepository | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns the git repository linked to the given project, or null if none exists. */
  async findByProjectId(projectId: ProjectId): Promise<GitRepository | null> {
    for (const repo of this.storage.values()) {
      if (repo.projectId.value === projectId.value) {
        return repo;
      }
    }
    return null;
  }

  /** Stores a git repository in memory, overwriting any existing entry with the same ID. */
  async save(gitRepository: GitRepository): Promise<void> {
    this.storage.set(gitRepository.id.value, gitRepository);
  }

  /** Removes the git repository with the given ID from memory. */
  async delete(id: GitRepositoryId): Promise<void> {
    this.storage.delete(id.value);
  }
}
