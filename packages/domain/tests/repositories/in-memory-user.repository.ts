import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserRepository } from '../../src/repositories/user.repository';

/** In-memory implementation of UserRepository for use in tests. */
export class InMemoryUserRepository implements UserRepository {
  private readonly storage = new Map<string, User>();

  /** Returns the user with the given ID, or null if not found. */
  async findById(id: UserId): Promise<User | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns the user with the given email address, or null if not found. */
  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.storage.values()) {
      if (user.email.value === email.value) {
        return user;
      }
    }
    return null;
  }

  /** Stores a user in memory, overwriting any existing entry with the same ID. */
  async save(user: User): Promise<void> {
    this.storage.set(user.id.value, user);
  }

  /**
   * @returns True when the in-memory store contains at least one user.
   */
  async hasAny(): Promise<boolean> {
    return this.storage.size > 0;
  }

  /**
   * Simple in-memory search by displayName or email substring.
   * The `excludeProjectId` parameter is accepted but not enforced here —
   * project-membership exclusion is tested at the API integration level.
   */
  async search(query: string, _excludeProjectId?: ProjectId): Promise<User[]> {
    const lower = query.toLowerCase();
    return [...this.storage.values()]
      .filter(
        (u) =>
          u.displayName.toLowerCase().includes(lower) ||
          u.email.value.toLowerCase().includes(lower),
      )
      .slice(0, 10);
  }
}
