import { PrismaClient } from '@prisma/client';
import { Project, ProjectId, UserId, ProjectName, Timestamps, ProjectRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `ProjectRepository` interface.
 * Maps between domain `Project` entities and the `Project` database table,
 * including tags stored as a JSON array and nullable description.
 */
export class PrismaProjectRepository implements ProjectRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the project.
   * @returns The project if found, null otherwise.
   */
  async findById(id: ProjectId): Promise<Project | null> {
    const record = await this.prisma.project.findUnique({ where: { id: id.value } });
    return record ? toDomainProject(record) : null;
  }

  /**
   * @param ownerId - The user ID of the project owner.
   * @returns All projects owned by the given user.
   */
  async findByOwnerId(ownerId: UserId): Promise<Project[]> {
    const records = await this.prisma.project.findMany({ where: { ownerId: ownerId.value } });
    return records.map(toDomainProject);
  }

  /**
   * Creates or updates a project. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param project - The project entity to persist.
   */
  async save(project: Project): Promise<void> {
    const data = toPersistenceProject(project);
    await this.prisma.project.upsert({
      where: { id: project.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * @param id - The unique identifier of the project to delete.
   */
  async delete(id: ProjectId): Promise<void> {
    await this.prisma.project.deleteMany({ where: { id: id.value } });
  }
}

function toDomainProject(record: {
  id: string; name: string; description: string | null; ownerId: string;
  tags: unknown; createdAt: Date; updatedAt: Date;
}): Project {
  let tags: string[] = [];
  if (Array.isArray(record.tags)) {
    tags = record.tags.filter((t): t is string => typeof t === 'string');
  }
  return new Project(
    ProjectId.create(record.id),
    ProjectName.create(record.name),
    record.description,
    UserId.create(record.ownerId),
    tags,
    null,
    new Timestamps(record.createdAt, record.updatedAt),
  );
}

function toPersistenceProject(project: Project): {
  id: string; name: string; description: string | null; ownerId: string;
  tags: string[]; createdAt: Date; updatedAt: Date;
} {
  return {
    id: project.id.value,
    name: project.name.value,
    description: project.description,
    ownerId: project.ownerId.value,
    tags: [...project.tags],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
