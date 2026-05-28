import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { AuditLog, AuditLogId, UserId, ProjectId, AuditLogRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `AuditLogRepository` interface.
 * Maps between domain `AuditLog` entities and the `AuditLog` database table.
 * Audit logs store immutable action records with optional JSON metadata and
 * an optional project association.
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param auditLog - The audit log entry to persist.
   */
  async save(auditLog: AuditLog): Promise<void> {
    await this.prisma.auditLog.create({ data: toPersistenceAuditLog(auditLog) });
  }

  /**
   * @param projectId - The project ID to filter by.
   * @returns All audit log entries associated with the project.
   */
  async findByProjectId(projectId: ProjectId): Promise<AuditLog[]> {
    const records = await this.prisma.auditLog.findMany({ where: { projectId: projectId.value } });
    return records.map(toDomainAuditLog);
  }

  /**
   * @param userId - The user ID to filter by.
   * @returns All audit log entries for the given user.
   */
  async findByUserId(userId: UserId): Promise<AuditLog[]> {
    const records = await this.prisma.auditLog.findMany({ where: { userId: userId.value } });
    return records.map(toDomainAuditLog);
  }

  /**
   * @returns All audit log entries in the database.
   */
  async findAll(): Promise<AuditLog[]> {
    const records = await this.prisma.auditLog.findMany();
    return records.map(toDomainAuditLog);
  }
}

type AuditLogRecord = {
  id: string; userId: string; projectId: string | null;
  action: string; resourceType: string; resourceId: string;
  timestamp: Date; metadata: Prisma.JsonValue;
};

function toDomainAuditLog(record: AuditLogRecord): AuditLog {
  return new AuditLog(
    AuditLogId.create(record.id),
    UserId.create(record.userId),
    record.projectId ? ProjectId.create(record.projectId) : null,
    record.action,
    record.resourceType,
    record.resourceId,
    record.timestamp,
    extractMetadata(record.metadata),
  );
}

/**
 * Safely converts a `Prisma.JsonValue` to a `Record<string, unknown>`.
 * Returns an empty object for non-object values (null, arrays, primitives).
 */
function extractMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = v === null ? null : v;
    }
    return result;
  }
  return {};
}

function toPersistenceAuditLog(auditLog: AuditLog): Prisma.AuditLogCreateInput {
  return {
    id: auditLog.id.value,
    user: { connect: { id: auditLog.userId.value } },
    project: auditLog.projectId ? { connect: { id: auditLog.projectId.value } } : undefined,
    action: auditLog.action,
    resourceType: auditLog.resourceType,
    resourceId: auditLog.resourceId,
    timestamp: auditLog.timestamp,
    metadata: deepCloneAsJsonValue(auditLog.metadata),
  };
}

/**
 * Deep-clones a `Record<string, unknown>` into a `Prisma.InputJsonValue`.
 * Uses round-trip JSON serialization to ensure a fully frozen, JSON-safe copy.
 */
function deepCloneAsJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return metadataToInputJsonValue(structuredClone(value));
}

function metadataToInputJsonValue(record: Record<string, unknown>): Prisma.InputJsonValue {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = unknownToInputJsonValue(value);
  }
  return result;
}

function unknownToInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(unknownToInputJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = unknownToInputJsonValue(val);
    }
    return result;
  }
  return null;
}
