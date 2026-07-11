import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  ReviewReaction,
  ReviewReactionId,
  ReviewCommentId,
  UserId,
  ReviewReactionRepository,
} from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `ReviewReactionRepository` interface.
 * Maps between domain `ReviewReaction` entities and the `ReviewReaction` table.
 * The triple `(reviewCommentId, userId, emoji)` is unique, which makes
 * {@link PrismaReviewReactionRepository.toggle} idempotent.
 */
export class PrismaReviewReactionRepository implements ReviewReactionRepository {
  /** Creates a new PrismaReviewReactionRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Toggles the caller's reaction on the unique `(reviewCommentId, userId, emoji)`
   * triple: an existing reaction is deleted, otherwise the provided one is created.
   *
   * @param reaction - Carries the target triple and the id to insert.
   */
  async toggle(reaction: ReviewReaction): Promise<void> {
    const existing = await this.prisma.reviewReaction.findUnique({
      where: {
        reviewCommentId_userId_emoji: {
          reviewCommentId: reaction.reviewCommentId.value,
          userId: reaction.userId.value,
          emoji: reaction.emoji,
        },
      },
    });
    await (existing ? this.prisma.reviewReaction.delete({ where: { id: existing.id } }) : this.prisma.reviewReaction.create({ data: toPersistenceReviewReaction(reaction) }));
  }

  /**
   * @param reviewCommentIds - The review items to gather reactions for.
   * @returns Every reaction attached to any of the given items.
   */
  async listForItems(reviewCommentIds: ReviewCommentId[]): Promise<ReviewReaction[]> {
    const records = await this.prisma.reviewReaction.findMany({
      where: { reviewCommentId: { in: reviewCommentIds.map((id) => id.value) } },
    });
    return records.map(toDomainReviewReaction);
  }
}

type ReviewReactionRecord = {
  id: string;
  reviewCommentId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
};

function toDomainReviewReaction(record: ReviewReactionRecord): ReviewReaction {
  return new ReviewReaction(
    ReviewReactionId.create(record.id),
    ReviewCommentId.create(record.reviewCommentId),
    UserId.create(record.userId),
    record.emoji,
    record.createdAt,
  );
}

function toPersistenceReviewReaction(reaction: ReviewReaction): Prisma.ReviewReactionUncheckedCreateInput {
  return {
    id: reaction.id.value,
    reviewCommentId: reaction.reviewCommentId.value,
    userId: reaction.userId.value,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt,
  };
}
