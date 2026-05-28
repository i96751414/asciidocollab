import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { GitRepository, GitRepositoryId, ProjectId, GitProvider, GitRepositoryRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `GitRepositoryRepository` interface.
 * Maps between domain `GitRepository` entities and the `GitRepository` database table.
 * Each project can have at most one git repository (one-to-one via `projectId` unique).
 */
export class PrismaGitRepositoryRepository implements GitRepositoryRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the git repository.
   * @returns The git repository if found, null otherwise.
   */
  async findById(id: GitRepositoryId): Promise<GitRepository | null> {
    const record = await this.prisma.gitRepository.findUnique({ where: { id: id.value } });
    return record ? toDomainGitRepository(record) : null;
  }

  /**
   * @param projectId - The project ID to look up.
   * @returns The git repository associated with the project, null otherwise.
   */
  async findByProjectId(projectId: ProjectId): Promise<GitRepository | null> {
    const record = await this.prisma.gitRepository.findUnique({ where: { projectId: projectId.value } });
    return record ? toDomainGitRepository(record) : null;
  }

  /**
   * Creates or updates a git repository. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param gitRepository - The git repository entity to persist.
   */
  async save(gitRepository: GitRepository): Promise<void> {
    const data = toPersistenceGitRepository(gitRepository);
    await this.prisma.gitRepository.upsert({
      where: { id: gitRepository.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * @param id - The unique identifier of the git repository to delete.
   */
  async delete(id: GitRepositoryId): Promise<void> {
    await this.prisma.gitRepository.deleteMany({ where: { id: id.value } });
  }
}

type GitRepositoryRecord = {
  id: string; projectId: string; provider: string; remoteUrl: string;
  credentialRef: string; currentBranch: string; lastSyncAt: Date | null; createdAt: Date;
};

function toDomainGitRepository(record: GitRepositoryRecord): GitRepository {
  return new GitRepository(
    GitRepositoryId.create(record.id),
    ProjectId.create(record.projectId),
    GitProvider.create(record.provider.toLowerCase()),
    record.remoteUrl,
    record.credentialRef,
    record.currentBranch,
    record.lastSyncAt,
    record.createdAt,
  );
}

function toPrismaProvider(value: string): 'GITHUB' | 'GITLAB' | 'BITBUCKET' {
  if (value === 'github') return 'GITHUB';
  if (value === 'gitlab') return 'GITLAB';
  return 'BITBUCKET';
}

function toPersistenceGitRepository(gitRepository: GitRepository): Prisma.GitRepositoryUncheckedCreateInput {
  return {
    id: gitRepository.id.value,
    projectId: gitRepository.projectId.value,
    provider: toPrismaProvider(gitRepository.provider.value),
    remoteUrl: gitRepository.remoteUrl,
    credentialRef: gitRepository.credentialReference,
    currentBranch: gitRepository.currentBranch,
    lastSyncAt: gitRepository.lastSyncAt,
    createdAt: gitRepository.createdAt,
  };
}
