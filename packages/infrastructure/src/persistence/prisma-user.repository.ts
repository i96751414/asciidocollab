import { PrismaClient } from '@prisma/client';
import { User, UserId, Email, Timestamps, UserRepository } from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `UserRepository` interface.
 * Maps between domain `User` entities and the `User` database table.
 */
export class PrismaUserRepository implements UserRepository {
  /**
   *
   */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param id - The unique identifier of the user.
   * @returns The user if found, null otherwise.
   */
  async findById(id: UserId): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id: id.value } });
    return record ? toDomainUser(record) : null;
  }

  /**
   * @param email - The email address to look up.
   * @returns The user if found, null otherwise.
   */
  async findByEmail(email: Email): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email: email.value } });
    return record ? toDomainUser(record) : null;
  }

  /**
   * Creates or updates a user. Uses Prisma upsert so the same method
   * handles both insert and update based on whether the ID already exists.
   *
   * @param user - The user entity to persist.
   */
  async save(user: User): Promise<void> {
    const data = toPersistenceUser(user);
    await this.prisma.user.upsert({
      where: { id: user.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * @returns True when at least one user row exists in the database.
   */
  async hasAny(): Promise<boolean> {
    return (await this.prisma.user.count({ take: 1 })) > 0;
  }
}

function toDomainUser(record: {
  id: string; email: string; displayName: string; passwordHash: string | null;
  passwordHistory: string[]; samlSubject: string | null; mfaSecret: string | null;
  createdAt: Date; updatedAt: Date;
}): User {
  return new User(
    UserId.create(record.id),
    Email.create(record.email),
    record.displayName,
    record.passwordHash,
    record.passwordHistory,
    record.samlSubject,
    record.mfaSecret,
    new Timestamps(record.createdAt, record.updatedAt),
  );
}

function toPersistenceUser(user: User): {
  id: string; email: string; displayName: string; passwordHash: string | null;
  passwordHistory: string[]; samlSubject: string | null; mfaSecret: string | null;
  createdAt: Date; updatedAt: Date;
} {
  return {
    id: user.id.value,
    email: user.email.value,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    passwordHistory: user.passwordHistory,
    samlSubject: user.samlSubject,
    mfaSecret: user.mfaSecret,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
