import { ReviewReaction } from '../../../src/entities/review-reaction';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ReviewReactionRepository } from '../../../src/ports/review/review-reaction.repository';

/** In-memory ReviewReactionRepository for use-case tests. Idempotent toggle on (comment,user,emoji). */
export class InMemoryReviewReactionRepository implements ReviewReactionRepository {
  private readonly storage = new Map<string, ReviewReaction>();

  async toggle(reaction: ReviewReaction): Promise<void> {
    const key = this.tripleKey(reaction.reviewCommentId.value, reaction.userId.value, reaction.emoji);
    if (this.storage.has(key)) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, reaction);
    }
  }

  async listForItems(reviewCommentIds: ReviewCommentId[]): Promise<ReviewReaction[]> {
    const ids = new Set(reviewCommentIds.map((id) => id.value));
    return [...this.storage.values()].filter((r) => ids.has(r.reviewCommentId.value));
  }

  private tripleKey(commentId: string, userId: string, emoji: string): string {
    return `${commentId}::${userId}::${emoji}`;
  }
}
