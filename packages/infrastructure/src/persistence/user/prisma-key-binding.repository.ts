import type { PrismaClient } from '@prisma/client';
import type { KeyBinding } from '@asciidocollab/domain';
import type { KeyBindingRepository } from '@asciidocollab/domain';

/** Prisma implementation of KeyBindingRepository. */
export class PrismaKeyBindingRepository implements KeyBindingRepository {
  /** Initializes the repository with a Prisma client instance. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns all stored key bindings for the given user. */
  async findAll(userId: string): Promise<KeyBinding[]> {
    const rows = await this.prisma.userKeyBinding.findMany({ where: { userId } });
    return rows.map((r) => ({ userId: r.userId, action: r.action, keyCombo: r.keyCombo }));
  }

  /** Inserts or updates the key binding for the given user action. */
  async upsert(userId: string, action: string, keyCombo: string): Promise<void> {
    await this.prisma.userKeyBinding.upsert({
      where: { userId_action: { userId, action } },
      update: { keyCombo },
      create: { userId, action, keyCombo },
    });
  }

  /** Removes the custom key binding for the given user action, reverting it to the default. */
  async delete(userId: string, action: string): Promise<void> {
    await this.prisma.userKeyBinding.deleteMany({ where: { userId, action } });
  }
}
