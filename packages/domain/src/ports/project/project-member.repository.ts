import { ProjectMember } from '../../entities/project-member';
import { ProjectId } from '../../value-objects/ids/project-id';
import { UserId } from '../../value-objects/ids/user-id';
import { Role } from '../../value-objects/identity/role';

/**
 * Repository interface for managing ProjectMember persistence.
 * Handles storage and retrieval of project membership associations and roles.
 */
export interface ProjectMemberRepository {
  /**
   * Finds all members of a given project.
   * 
   * @param projectId - The unique identifier of the project.
   * @returns An array of project members belonging to the project.
   */
  findByProjectId(projectId: ProjectId): Promise<ProjectMember[]>;

  /**
   * Finds all project memberships for a given user.
   * 
   * @param userId - The unique identifier of the user.
   * @returns An array of project memberships for the user.
   */
  findByUserId(userId: UserId): Promise<ProjectMember[]>;

  /**
   * Finds a specific project membership by project and user.
   * 
   * @param projectId - The unique identifier of the project.
   * @param userId - The unique identifier of the user.
   * @returns The project member if found, null otherwise.
   */
  findByCompositeKey(projectId: ProjectId, userId: UserId): Promise<ProjectMember | null>;

  /**
   * Adds a new member to a project.
   *
   * @param member - The project member entity to add.
   * @returns A promise that resolves when the member is added.
   */
  addMember(member: ProjectMember): Promise<void>;

  /**
   * Removes a member from a project.
   *
   * @param projectId - The unique identifier of the project.
   * @param userId - The unique identifier of the user to remove.
   * @returns A promise that resolves when the member is removed.
   */
  removeMember(projectId: ProjectId, userId: UserId): Promise<void>;

  /**
   * Updates the role of an existing project member.
   *
   * @param projectId - The unique identifier of the project.
   * @param userId - The unique identifier of the user whose role to update.
   * @param newRole - The new role to assign.
   * @returns A promise that resolves when the role is updated.
   */
  updateRole(projectId: ProjectId, userId: UserId, newRole: Role): Promise<void>;

  /**
   * Returns projects where the given user is the sole OWNER
   * (no other OWNER member exists).
   *
   * @param userId - The user to check sole ownership for.
   * @returns An array of projects where the user is the only owner.
   */
  findSoleOwnerProjects(userId: UserId): Promise<Array<{ id: ProjectId; name: string }>>;
}
