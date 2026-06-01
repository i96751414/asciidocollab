import { PrismaClient } from '@prisma/client';
import { SystemSettingRepository } from '@asciidocollab/domain';

/** Prisma-backed implementation of the `SystemSettingRepository` interface. */
export class PrismaSystemSettingRepository implements SystemSettingRepository {
  /** Creates a new PrismaSystemSettingRepository. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns the stored value for the given key, or null if not found. */
  async get(key: string): Promise<string | null> {
    const record = await this.prisma.systemSetting.findUnique({ where: { key } });
    return record?.value ?? null;
  }

  /** Upserts the value for the given key in the database. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
