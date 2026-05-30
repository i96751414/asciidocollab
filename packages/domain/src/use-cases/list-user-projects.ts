import { Project } from '../entities/project';
import { UserId } from '../value-objects/user-id';
import { ProjectRepository, PaginationParameters } from '../repositories/project.repository';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';

/**
 * Result returned on successful project listing.
 */
export interface ListUserProjectsResult {
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
 * Default pagination parameters.
 */
const DEFAULT_PAGINATION: PaginationParameters = { page: 1, limit: 20 };

/**
 * Lists all projects where the user is a member.
 * Supports pagination and filtering by archive status.
 */
export class ListUserProjectsUseCase {
  /**
   * Creates a new ListUserProjectsUseCase.
   *
   * @param projectRepo - The project repository.
   */
  constructor(
    private readonly projectRepo: ProjectRepository,
  ) {}

  /**
   * Lists all projects where the user is a member.
   *
   * @param actorId - The user requesting the project list.
   * @param pagination - Pagination parameters.
   * @param includeArchived - Whether to include archived projects.
   * @returns Paginated list of projects.
   */
  async execute(
    actorId: UserId,
    pagination: PaginationParameters = DEFAULT_PAGINATION,
    includeArchived = false,
  ): Promise<Result<ListUserProjectsResult, DomainError>> {
    const result = await this.projectRepo.findByMemberId(
      actorId,
      pagination,
      includeArchived,
    );

    return {
      success: true,
      value: {
        projects: result.projects,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }
}
