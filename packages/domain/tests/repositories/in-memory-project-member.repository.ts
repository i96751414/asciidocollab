import { ProjectMember } from '../../src/entities/project-member';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserId } from '../../src/value-objects/user-id';
import { Role } from '../../src/value-objects/role';
import { ProjectMemberRepository } from '../../src/repositories/project-member.repository';

function compositeKey(projectId: ProjectId, userId: UserId): string {
  return `${projectId.value}:${userId.value}`;
}

/**
 *
 */
export class InMemoryProjectMemberRepository implements ProjectMemberRepository {
  private readonly storage = new Map<string, ProjectMember>();

  /**
   *
   */
  async findByProjectId(projectId: ProjectId): Promise<ProjectMember[]> {
    return Array.from(this.storage.values()).filter(
      (m) => m.projectId.value === projectId.value,
    );
  }

  /**
   *
   */
  async findByUserId(userId: UserId): Promise<ProjectMember[]> {
    return Array.from(this.storage.values()).filter(
      (m) => m.userId.value === userId.value,
    );
  }

  /**
   *
   */
  async findByCompositeKey(projectId: ProjectId, userId: UserId): Promise<ProjectMember | null> {
    return this.storage.get(compositeKey(projectId, userId)) ?? null;
  }

  /**
   *
   */
  async addMember(member: ProjectMember): Promise<void> {
    this.storage.set(compositeKey(member.projectId, member.userId), member);
  }

  /**
   *
   */
  async removeMember(projectId: ProjectId, userId: UserId): Promise<void> {
    this.storage.delete(compositeKey(projectId, userId));
  }

  /**
   *
   */
  async updateRole(projectId: ProjectId, userId: UserId, newRole: Role): Promise<void> {
    const key = compositeKey(projectId, userId);
    const member = this.storage.get(key);
    if (member) {
      const updated = new ProjectMember(member.projectId, member.userId, newRole, member.joinedAt);
      this.storage.set(key, updated);
    }
  }
}
