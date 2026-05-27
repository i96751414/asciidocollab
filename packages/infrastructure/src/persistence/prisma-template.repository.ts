import { PrismaClient } from '@prisma/client';
import { Template, TemplateId, ProjectId, TemplateCategory, TemplateRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `TemplateRepository` interface.
 * Maps between domain `Template` entities and the `Template` database table.
 * Templates are project-agnostic and optionally reference a source project.
 */
export class PrismaTemplateRepository implements TemplateRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the template.
   * @returns The template if found, null otherwise.
   */
  async findById(id: TemplateId): Promise<Template | null> {
    const record = await this.prisma.template.findUnique({ where: { id: id.value } });
    return record ? toDomainTemplate(record) : null;
  }

  /**
   * Creates or updates a template. Uses upsert so the same method
   * handles both insert and update.
   * 
   * @param template - The template entity to persist.
   */
  async save(template: Template): Promise<void> {
    const data = toPersistenceTemplate(template);
    await this.prisma.template.upsert({
      where: { id: template.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * @param id - The unique identifier of the template to delete.
   */
  async delete(id: TemplateId): Promise<void> {
    await this.prisma.template.deleteMany({ where: { id: id.value } });
  }

  /**
   * @returns All templates in the database.
   */
  async findAll(): Promise<Template[]> {
    const records = await this.prisma.template.findMany();
    return records.map(toDomainTemplate);
  }
}

function toDomainTemplate(record: {
  id: string; name: string; description: string | null;
  category: string; sourceProjectId: string | null; createdAt: Date;
}): Template {
  return new Template(
    TemplateId.create(record.id),
    record.name,
    record.description,
    TemplateCategory.create(record.category),
    record.sourceProjectId ? ProjectId.create(record.sourceProjectId) : null,
    record.createdAt,
  );
}

function toPersistenceTemplate(template: Template): {
  id: string; name: string; description: string | null;
  category: string; sourceProjectId: string | null; createdAt: Date;
} {
  return {
    id: template.id.value,
    name: template.name,
    description: template.description,
    category: template.category.value,
    sourceProjectId: template.sourceProjectId?.value ?? null,
    createdAt: template.createdAt,
  };
}
