import { GitRepositoryId } from '../value-objects/git-repository-id';
import { ProjectId } from '../value-objects/project-id';
import { GitProvider } from '../value-objects/git-provider';

/**
 * Links a project to an external Git repository for synchronisation.
 *
 * A GitRepository has a strict 1:1 relationship with a Project — each project
 * can be connected to at most one remote repository.
 */
export class GitRepository {
  /**
   *
   */
  constructor(
    /** Unique identifier for this repository link. */
    public readonly id: GitRepositoryId,
    /** The project this repository link belongs to (1:1 relationship). */
    public readonly projectId: ProjectId,
    /** The Git hosting provider (e.g. GitHub, GitLab, Bitbucket). */
    public readonly provider: GitProvider,
    /** The full remote URL of the Git repository. */
    public readonly remoteUrl: string,
    /** Reference to stored credentials used for authentication. */
    public readonly credentialRef: string,
    /** The currently active branch. Defaults to `'main'`. */
    public readonly currentBranch: string = 'main',
    /**
     * Timestamp of the last successful synchronisation, or null if never
     *  synced.
     */
    public readonly lastSyncAt: Date | null = null,
    /**
     * Timestamp when the repository link was created. Defaults to the current
     *  time.
     */
    public readonly createdAt: Date = new Date(),
  ) {}
}
