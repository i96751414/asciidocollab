import { ProjectMember } from '../entities/project-member';
import { ProjectId } from '../value-objects/project-id';
import { UserId } from '../value-objects/user-id';
import { Role } from '../value-objects/role';

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
   * @returns A promise that resolves when the operation completes.
   */
  addMember(member: ProjectMember): Promise<void>;

  /**
   * Removes a member from a project.
   * 
   * @param projectId - The unique identifier of the project.
   * @param userId - The unique identifier of the user to remove.
   * @returns A promise that resolves when the operation completes.
   */
  removeMember(projectId: ProjectId, userId: UserId): Promise<void>;

  /**
   * Updates the role of a project member.
   * 
   * @param projectId - The unique identifier of the project.
   * @param userId - The unique identifier of the user.
   * @param newRole - The new role to assign.
   * @returns A promise that resolves when the operation completes.
   */
  updateRole(projectId: ProjectId, userId: UserId, newRole: Role): Promise<void>;
}
