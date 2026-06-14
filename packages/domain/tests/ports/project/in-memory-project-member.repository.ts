import { ProjectMember } from '../../../src/entities/project-member';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { Role } from '../../../src/value-objects/identity/role';
import { ProjectMemberRepository } from '../../../src/ports/project/project-member.repository';

function compositeKey(projectId: ProjectId, userId: UserId): string {
  return `${projectId.value}:${userId.value}`;
}

/** In-memory implementation of ProjectMemberRepository for use in tests. */
export class InMemoryProjectMemberRepository implements ProjectMemberRepository {
  private readonly storage = new Map<string, ProjectMember>();

  /** Returns all project members belonging to the given project. */
  async findByProjectId(projectId: ProjectId): Promise<ProjectMember[]> {
    return [...this.storage.values()].filter(
      (m) => m.projectId.value === projectId.value,
    );
  }

  /** Returns all project memberships for the given user. */
  async findByUserId(userId: UserId): Promise<ProjectMember[]> {
    return [...this.storage.values()].filter(
      (m) => m.userId.value === userId.value,
    );
  }

  /** Returns the membership record for the given project and user combination, or null if absent. */
  async findByCompositeKey(projectId: ProjectId, userId: UserId): Promise<ProjectMember | null> {
    return this.storage.get(compositeKey(projectId, userId)) ?? null;
  }

  /** Adds a new member to the in-memory store keyed by project and user. */
  async addMember(member: ProjectMember): Promise<void> {
    this.storage.set(compositeKey(member.projectId, member.userId), member);
  }

  /** Removes the membership record for the given project and user from memory. */
  async removeMember(projectId: ProjectId, userId: UserId): Promise<void> {
    this.storage.delete(compositeKey(projectId, userId));
  }

  async updateRole(projectId: ProjectId, userId: UserId, newRole: Role): Promise<void> {
    const key = compositeKey(projectId, userId);
    const member = this.storage.get(key);
    if (member) {
      const updated = new ProjectMember(member.projectId, member.userId, newRole, member.joinedAt);
      this.storage.set(key, updated);
    }
  }

  async findSoleOwnerProjects(userId: UserId): Promise<Array<{ id: ProjectId; name: string }>> {
    const ownerMemberships = [...this.storage.values()].filter(
      (m) => m.userId.value === userId.value && m.role.value === 'owner',
    );

    const result: Array<{ id: ProjectId; name: string }> = [];
    for (const membership of ownerMemberships) {
      const otherOwners = [...this.storage.values()].filter(
        (m) =>
          m.projectId.value === membership.projectId.value &&
          m.userId.value !== userId.value &&
          m.role.value === 'owner',
      );
      if (otherOwners.length === 0) {
        result.push({ id: membership.projectId, name: 'Project' });
      }
    }
    return result;
  }
}
