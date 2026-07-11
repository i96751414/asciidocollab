import { ReviewReactionId } from '../value-objects/ids/review-reaction-id';
import { ReviewCommentId } from '../value-objects/ids/review-comment-id';
import { UserId } from '../value-objects/ids/user-id';

/**
 * One user's emoji reaction to a single review item. The triple
 * `(reviewCommentId, userId, emoji)` is unique, which makes toggling idempotent
 * (a repeated react is a no-op resolved to a delete at the repository).
 *
 * @invariant `emoji` is a non-empty normalized unicode-emoji key (validated at the boundary).
 */
export class ReviewReaction {
  private readonly _createdAt: Date;

  /**
   * @throws {Error} If `emoji` is empty.
   */
  constructor(
    /** Unique identifier for the reaction row. */
    public readonly id: ReviewReactionId,
    /** The review item this reaction is attached to. */
    public readonly reviewCommentId: ReviewCommentId,
    /** The reacting user. */
    public readonly userId: UserId,
    /** The normalized unicode-emoji key. */
    public readonly emoji: string,
    createdAt: Date = new Date(),
  ) {
    if (emoji.length === 0) {
      throw new Error('reaction emoji must be non-empty');
    }
    this._createdAt = new Date(createdAt);
  }

  /** @returns A defensive copy of the creation date. */
  get createdAt(): Date {
    return new Date(this._createdAt);
  }
}
