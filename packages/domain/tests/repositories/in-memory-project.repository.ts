import { Project } from '../../src/entities/project';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserId } from '../../src/value-objects/user-id';
import {
  ProjectRepository,
  PaginationParameters,
  PaginatedProjects,
} from '../../src/repositories/project.repository';

/**
 * In-memory implementation of ProjectRepository for testing.
 * Accepts an optional membership map for testing findByMemberId with non-owner members.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly storage = new Map<string, Project>();
  private readonly membershipMap: Map<string, Set<string>>;

  /**
   * Creates a new InMemoryProjectRepository.
   *
   * @param membershipMap - Optional map of userId to set of projectIds for membership testing.
   */
  constructor(membershipMap?: Map<string, Set<string>>) {
    this.membershipMap = membershipMap || new Map();
  }

  /**
   * Adds a membership record for testing findByMemberId with non-owner members.
   *
   * @param projectId - The project to add membership for.
   * @param userId - The user to add as a member.
   */
  addMembership(projectId: ProjectId, userId: UserId): void {
    const userProjects = this.membershipMap.get(userId.value) || new Set();
    userProjects.add(projectId.value);
    this.membershipMap.set(userId.value, userProjects);
  }

  /**
   * Finds a project by its unique identifier.
   *
   * @param id - The unique identifier of the project.
   * @returns The project if found, null otherwise.
   */
  async findById(id: ProjectId): Promise<Project | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   * Finds all projects owned by a specific user.
   *
   * @param ownerId - The unique identifier of the owner user.
   * @returns An array of projects owned by the user.
   */
  async findByOwnerId(ownerId: UserId): Promise<Project[]> {
    return [...this.storage.values()].filter(
      (p) => p.ownerId.value === ownerId.value,
    );
  }

  /**
   * Finds all projects where the user is a member (owner or member).
   *
   * @param userId - The unique identifier of the user.
   * @param pagination - Pagination parameters.
   * @param includeArchived - Whether to include archived projects.
   * @returns Paginated list of projects.
   */
  async findByMemberId(
    userId: UserId,
    pagination: PaginationParameters,
    includeArchived = false,
  ): Promise<PaginatedProjects> {
    const userProjectIds = this.membershipMap.get(userId.value) || new Set();
    
    let projects = [...this.storage.values()].filter(
      (p) => 
        p.ownerId.value === userId.value || 
        userProjectIds.has(p.id.value),
    );

    if (includeArchived) {
      // Include all projects (both active and archived)
    } else {
      projects = projects.filter((p) => p.archivedAt === null);
    }

    const total = projects.length;
    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    const paginatedProjects = projects.slice(start, end);

    return {
      projects: paginatedProjects,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Persists a project entity (create or update).
   *
   * @param project - The project entity to save.
   */
  async save(project: Project): Promise<void> {
    this.storage.set(project.id.value, project);
  }

  /**
   * Archives a project by calling its archive method.
   * The archive timestamp is managed by the Project entity.
   *
   * @param id - The unique identifier of the project to archive.
   * @param _archivedAt - The archive timestamp (unused, managed by entity).
   */
  async archive(id: ProjectId, _archivedAt: Date): Promise<void> {
    const project = this.storage.get(id.value);
    if (project) {
      project.archive();
      this.storage.set(id.value, project);
    }
  }

  /**
   * Restores an archived project by setting archivedAt to null.
   *
   * @param id - The unique identifier of the project to restore.
   */
  async restore(id: ProjectId): Promise<void> {
    const project = this.storage.get(id.value);
    if (project && project.archivedAt !== null) {
      project.restore();
      this.storage.set(id.value, project);
    }
  }

  /**
   * Removes a project by its unique identifier.
   *
   * @param id - The unique identifier of the project to delete.
   */
  async delete(id: ProjectId): Promise<void> {
    this.storage.delete(id.value);
  }
}
