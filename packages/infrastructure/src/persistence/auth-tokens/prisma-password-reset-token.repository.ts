import { PrismaClient } from '@prisma/client';
import {
  PasswordResetToken,
  PasswordResetTokenId,
  UserId,
  PasswordResetTokenRepository,
} from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `PasswordResetTokenRepository` interface.
 * Maps between domain `PasswordResetToken` entities and the `PasswordResetToken` database table.
 */
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  /**
   * @param prisma - The Prisma client used for database operations.
   */
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param token - The token entity to persist.
   */
  async save(token: PasswordResetToken): Promise<void> {
    const data = toPersistence(token);
    await this.prisma.passwordResetToken.upsert({
      where: { id: token.id.value },
      create: data,
      update: data,
    });
  }

  /**
   * @param tokenHash - The SHA-256 hash of the raw token.
   * @returns The matching token if found and valid, null otherwise.
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return record ? toDomain(record) : null;
  }

  /**
   * @param userId - The user who owns the tokens.
   * @returns A list of tokens for the user, ordered by creation date descending.
   */
  async findByUserId(userId: UserId): Promise<PasswordResetToken[]> {
    const records = await this.prisma.passwordResetToken.findMany({
      where: { userId: userId.value },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toDomain);
  }

  /**
   * @param id - The token record ID.
   * @param usedAt - The timestamp when the token was consumed.
   */
  async markAsUsed(id: string, usedAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt },
    });
  }

  /**
   * @param userId - The user whose expired tokens should be removed.
   * @returns The number of deleted tokens.
   */
  async deleteExpired(userId: UserId): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: userId.value,
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}

function toDomain(record: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): PasswordResetToken {
  return new PasswordResetToken(
    PasswordResetTokenId.create(record.id),
    UserId.create(record.userId),
    record.tokenHash,
    record.expiresAt,
    record.usedAt,
    record.createdAt,
  );
}

function toPersistence(token: PasswordResetToken): {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
} {
  return {
    id: token.id.value,
    userId: token.userId.value,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt,
    createdAt: token.createdAt,
  };
}
