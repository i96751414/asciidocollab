import { PrismaClient } from '@prisma/client';
import {
  EmailVerificationToken,
  EmailVerificationTokenId,
  UserId,
  EmailVerificationTokenRepository,
} from '@asciidocollab/domain';

/** Prisma-backed implementation of the `EmailVerificationTokenRepository` interface. */
export class PrismaEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  /** Creates a new PrismaEmailVerificationTokenRepository. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Upserts the token record in the database. */
  async save(token: EmailVerificationToken): Promise<void> {
    const data = {
      id: token.id.value,
      userId: token.userId.value,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      createdAt: token.createdAt,
    };
    await this.prisma.emailVerificationToken.upsert({
      where: { id: token.id.value },
      create: data,
      update: data,
    });
  }

  /** Finds a token by its hashed value. */
  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    return record ? toDomainToken(record) : null;
  }

  /** Deletes all tokens belonging to the given user. */
  async deleteByUserId(userId: UserId): Promise<void> {
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId: userId.value } });
  }
}

function toDomainToken(record: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): EmailVerificationToken {
  return new EmailVerificationToken(
    EmailVerificationTokenId.create(record.id),
    UserId.create(record.userId),
    record.tokenHash,
    record.expiresAt,
    record.usedAt,
    record.createdAt,
  );
}
