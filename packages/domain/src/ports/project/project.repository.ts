import { Project } from '../../entities/project';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';

/**
 * Pagination parameters for listing projects.
 */
export interface PaginationParameters {
  /** The page number to retrieve (1-based). */
  page: number;
  /** The maximum number of items per page. */
  limit: number;
}

/**
 * Paginated result of projects.
 */
export interface PaginatedProjects {
  /** The list of projects for the current page. */
  projects: Project[];
  /** Total number of projects matching the query. */
  total: number;
  /** Current page number. */
  page: number;
  /** Number of items per page. */
  limit: number;
  /** Total number of pages. */
  totalPages: number;
}

/**
 * Repository interface for managing Project persistence.
 * Handles storage and retrieval of Project entities by their identifiers.
 */
export interface ProjectRepository {
  /**
   * Finds a project by its unique identifier.
   * 
   * @param id - The unique identifier of the project.
   * @returns The project if found, null otherwise.
   */
  findById(id: ProjectId): Promise<Project | null>;

  /**
   * Finds all projects where the user is a member.
   *
   * @param userId - The unique identifier of the user.
   * @param pagination - Pagination parameters.
   * @param archivedOnly - When true, return only archived projects; when false, return only active ones.
   * @returns Paginated list of projects.
   */
  findByMemberId(
    userId: UserId,
    pagination: PaginationParameters,
    archivedOnly?: boolean,
  ): Promise<PaginatedProjects>;

  /**
   * Persists a project entity (create or update).
   * 
   * @param project - The project entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(project: Project): Promise<void>;

  /**
   * Archives a project by setting archivedAt timestamp.
   * 
   * @param id - The unique identifier of the project to archive.
   * @param archivedAt - The archive timestamp.
   * @returns A promise that resolves when the operation completes.
   */
  archive(id: ProjectId, archivedAt: Date): Promise<void>;

  /**
   * Restores an archived project by setting archivedAt to null.
   * 
   * @param id - The unique identifier of the project to restore.
   * @returns A promise that resolves when the operation completes.
   */
  restore(id: ProjectId): Promise<void>;

  /**
   * Removes a project by its unique identifier.
   * 
   * @param id - The unique identifier of the project to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: ProjectId): Promise<void>;
}
