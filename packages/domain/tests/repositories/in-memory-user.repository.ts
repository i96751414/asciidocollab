import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { UserRepository } from '../../src/repositories/user.repository';

export class InMemoryUserRepository implements UserRepository {
  private readonly storage = new Map<string, User>();

  async findById(id: UserId): Promise<User | null> {
    return this.storage.get(id.value) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.storage.values()) {
      if (user.email.value === email.value) {
        return user;
      }
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.storage.set(user.id.value, user);
  }
}
