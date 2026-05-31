import { PrismaClient } from '@prisma/client';
import {
  EmailChangeToken,
  EmailChangeTokenId,
  UserId,
  EmailChangeTokenRepository,
} from '@asciidocollab/domain';

/** Prisma-backed implementation of EmailChangeTokenRepository. */
export class PrismaEmailChangeTokenRepository implements EmailChangeTokenRepository {
  /** Creates the repository with the given Prisma client. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Upserts the token by ID. */
  async save(token: EmailChangeToken): Promise<void> {
    const data = toPersistence(token);
    await this.prisma.emailChangeToken.upsert({
      where: { id: token.id.value },
      create: data,
      update: data,
    });
  }

  /** Returns the token matching the given hash, or null. */
  async findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null> {
    const record = await this.prisma.emailChangeToken.findFirst({
      where: { tokenHash },
    });
    return record ? toDomain(record) : null;
  }

  /** Returns the active (unused, non-expired) token for a user, or null. */
  async findActiveByUserId(userId: UserId): Promise<EmailChangeToken | null> {
    const record = await this.prisma.emailChangeToken.findFirst({
      where: {
        userId: userId.value,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return record ? toDomain(record) : null;
  }

  /** Marks the token with the given ID as used at the specified time. */
  async markAsUsed(id: string, usedAt: Date): Promise<void> {
    await this.prisma.emailChangeToken.update({
      where: { id },
      data: { usedAt },
    });
  }

  /** Deletes all tokens for the given user. */
  async deleteByUserId(userId: UserId): Promise<void> {
    await this.prisma.emailChangeToken.deleteMany({
      where: { userId: userId.value },
    });
  }
}

function toDomain(record: {
  id: string;
  userId: string;
  tokenHash: string;
  pendingEmail: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): EmailChangeToken {
  return new EmailChangeToken(
    EmailChangeTokenId.create(record.id),
    UserId.create(record.userId),
    record.tokenHash,
    record.pendingEmail,
    record.expiresAt,
    record.usedAt,
    record.createdAt,
  );
}

function toPersistence(token: EmailChangeToken) {
  return {
    id: token.id.value,
    userId: token.userId.value,
    tokenHash: token.tokenHash,
    pendingEmail: token.pendingEmail,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt,
    createdAt: token.createdAt,
  };
}
