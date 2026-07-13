import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ProjectRenderConfig,
  ProjectRenderConfigId,
  ProjectId,
  Timestamps,
  type RenderConfigData,
} from '@asciidocollab/domain';
import type { ProjectRenderConfigRepository } from '@asciidocollab/domain';

/** The persisted shape of a project render-config row. */
interface ProjectRenderConfigRow {
  id: string;
  projectId: string;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Coerce a stored JSON value into a render-config document. A corrupt or non-object stored value falls
 * back to the empty configuration rather than breaking a render — the option semantics are re-validated
 * at the API boundary anyway.
 */
function toRenderConfigData(value: Prisma.JsonValue): RenderConfigData {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = entry;
    }
    return result;
  }
  return {};
}

/** Convert an arbitrary value into a JSON-safe Prisma input value (assertion-free). */
function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toInputJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toInputJsonValue(entry);
    }
    return result;
  }
  return null;
}

/** Serialize a render-config document into a Prisma JSON input object. */
function configToInputJson(config: RenderConfigData): Prisma.InputJsonValue {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(config)) {
    result[key] = toInputJsonValue(value);
  }
  return result;
}

/** Prisma-backed implementation of ProjectRenderConfigRepository. */
export class PrismaProjectRenderConfigRepository implements ProjectRenderConfigRepository {
  /** @param prisma - The Prisma client instance. */
  constructor(private readonly prisma: PrismaClient) {}

  /** @inheritdoc */
  async findByProjectId(projectId: ProjectId): Promise<ProjectRenderConfig | null> {
    const row = await this.prisma.projectRenderConfig.findUnique({
      where: { projectId: projectId.value },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  /** @inheritdoc */
  async save(config: ProjectRenderConfig): Promise<void> {
    const json = configToInputJson(config.config);
    await this.prisma.projectRenderConfig.upsert({
      where: { projectId: config.projectId.value },
      update: { config: json },
      create: {
        id: config.id.value,
        projectId: config.projectId.value,
        config: json,
      },
    });
  }

  private toDomain(row: ProjectRenderConfigRow): ProjectRenderConfig {
    return new ProjectRenderConfig(
      ProjectRenderConfigId.create(row.id),
      ProjectId.create(row.projectId),
      toRenderConfigData(row.config),
      new Timestamps(row.createdAt, row.updatedAt),
    );
  }
}
