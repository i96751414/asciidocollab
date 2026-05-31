import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ProjectMember, ProjectId, UserId, Role, ProjectMemberRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `ProjectMemberRepository` interface.
 * Maps between domain `ProjectMember` entities and the `ProjectMember` join table.
 * Uses a composite key of `(projectId, userId)` for unique membership.
 */
export class PrismaProjectMemberRepository implements ProjectMemberRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param projectId - The project ID to filter by.
   * @returns All members of the given project.
   */
  async findByProjectId(projectId: ProjectId): Promise<ProjectMember[]> {
    const records = await this.prisma.projectMember.findMany({ where: { projectId: projectId.value } });
    return records.map(toDomainProjectMember);
  }

  /**
   * @param userId - The user ID to filter by.
   * @returns All projects the given user is a member of.
   */
  async findByUserId(userId: UserId): Promise<ProjectMember[]> {
    const records = await this.prisma.projectMember.findMany({ where: { userId: userId.value } });
    return records.map(toDomainProjectMember);
  }

  /**
   * @param projectId - The project to look up the membership for.
   * @param userId - The user to look up the membership for.
   * @returns The membership record if found, null otherwise.
   */
  async findByCompositeKey(projectId: ProjectId, userId: UserId): Promise<ProjectMember | null> {
    const record = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectId.value, userId: userId.value } },
    });
    return record ? toDomainProjectMember(record) : null;
  }

  /**
   * @param member - The project member to add.
   */
  async addMember(member: ProjectMember): Promise<void> {
    const data = toPersistenceProjectMember(member);
    await this.prisma.projectMember.create({ data });
  }

  /**
   * @param projectId - The project to remove the member from.
   * @param userId - The user to remove.
   */
  async removeMember(projectId: ProjectId, userId: UserId): Promise<void> {
    await this.prisma.projectMember.deleteMany({
      where: { projectId: projectId.value, userId: userId.value },
    });
  }

  /**
   * @param projectId - The project containing the membership.
   * @param userId - The user whose role to update.
   * @param newRole - The new role to assign.
   */
  async updateRole(projectId: ProjectId, userId: UserId, newRole: Role): Promise<void> {
    const role = toPrismaRole(newRole.value);
    await this.prisma.projectMember.updateMany({
      where: { projectId: projectId.value, userId: userId.value },
      data: { role },
    });
  }
}

type ProjectMemberRecord = {
  projectId: string; userId: string; role: string; joinedAt: Date;
};

function toPrismaRole(value: string): 'VIEWER' | 'EDITOR' | 'OWNER' {
  if (value === 'viewer') return 'VIEWER';
  if (value === 'editor') return 'EDITOR';
  return 'OWNER';
}

function toDomainProjectMember(record: ProjectMemberRecord): ProjectMember {
  return new ProjectMember(
    ProjectId.create(record.projectId),
    UserId.create(record.userId),
    Role.create(record.role.toLowerCase()),
    record.joinedAt,
  );
}

function toPersistenceProjectMember(member: ProjectMember): Prisma.ProjectMemberUncheckedCreateInput {
  return {
    projectId: member.projectId.value,
    userId: member.userId.value,
    role: toPrismaRole(member.role.value),
    joinedAt: member.joinedAt,
  };
}
