import { GitRepository } from '../../src/entities/git-repository';
import { GitRepositoryId } from '../../src/value-objects/git-repository-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { GitRepositoryRepository } from '../../src/repositories/git-repository.repository';

/**
 *
 */
export class InMemoryGitRepositoryRepository implements GitRepositoryRepository {
  private readonly storage = new Map<string, GitRepository>();

  /**
   *
   */
  async findById(id: GitRepositoryId): Promise<GitRepository | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   *
   */
  async findByProjectId(projectId: ProjectId): Promise<GitRepository | null> {
    for (const repo of this.storage.values()) {
      if (repo.projectId.value === projectId.value) {
        return repo;
      }
    }
    return null;
  }

  /**
   *
   */
  async save(gitRepository: GitRepository): Promise<void> {
    this.storage.set(gitRepository.id.value, gitRepository);
  }

  /**
   *
   */
  async delete(id: GitRepositoryId): Promise<void> {
    this.storage.delete(id.value);
  }
}
