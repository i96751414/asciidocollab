import type { KeyBinding } from '../../src/entities/key-binding';
import type { KeyBindingRepository } from '../../src/repositories/key-binding.repository';

/** In-memory implementation of KeyBindingRepository for domain unit tests. */
export class InMemoryKeyBindingRepository implements KeyBindingRepository {
  private readonly storage = new Map<string, string>();

  private key(userId: string, action: string): string {
    return `${userId}:${action}`;
  }

  async findAll(userId: string): Promise<KeyBinding[]> {
    const results: KeyBinding[] = [];
    for (const [k, keyCombo] of this.storage) {
      if (k.startsWith(`${userId}:`)) {
        const action = k.slice(userId.length + 1);
        results.push({ userId, action, keyCombo });
      }
    }
    return results;
  }

  async upsert(userId: string, action: string, keyCombo: string): Promise<void> {
    this.storage.set(this.key(userId, action), keyCombo);
  }

  async delete(userId: string, action: string): Promise<void> {
    this.storage.delete(this.key(userId, action));
  }
}
