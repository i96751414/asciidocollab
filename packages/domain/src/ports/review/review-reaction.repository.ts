import { ReviewReaction } from '../../entities/review-reaction';
import { ReviewCommentId } from '../../value-objects/ids/review-comment-id';

/**
 * Persistence port for emoji reactions. The triple `(reviewCommentId, userId,
 * emoji)` is unique, so {@link ReviewReactionRepository.toggle} is idempotent:
 * an existing reaction for that triple is removed, otherwise the provided one is
 * inserted.
 */
export interface ReviewReactionRepository {
  /**
   * Toggles the caller's reaction. If a reaction already exists for
   * `(reviewCommentId, userId, emoji)` it is deleted; otherwise `reaction` is
   * inserted.
   *
   * @param reaction - Carries the target `(reviewCommentId, userId, emoji)` and the id to insert.
   * @returns A promise that resolves when the toggle completes.
   */
  toggle(reaction: ReviewReaction): Promise<void>;

  /**
   * Lists every reaction attached to any of the given items.
   *
   * @param reviewCommentIds - The item ids whose reactions to fetch.
   * @returns The reactions across all of the given items.
   */
  listForItems(reviewCommentIds: ReviewCommentId[]): Promise<ReviewReaction[]>;
}
