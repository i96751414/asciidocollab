import { PrismaClient } from '@prisma/client';
import { UserId, SessionRepository } from '@asciidocollab/domain';

/** Prisma-backed implementation of the `SessionRepository` interface. */
export class PrismaSessionRepository implements SessionRepository {
  /** Creates a new PrismaSessionRepository. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Deletes all session records belonging to the given user. */
  async deleteByUserId(userId: UserId): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId: userId.value } });
  }
}
