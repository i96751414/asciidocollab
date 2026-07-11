import {
  ReviewComment,
  ReviewReaction,
  ReviewCommentId,
  ReviewReactionId,
  ProjectId,
  DocumentId,
  UserId,
  ReviewAnchor,
} from '@asciidocollab/domain';
import { toReviewItemDto, toThreads } from '../../../src/routes/review/dto';
import type { UserLookup } from '../../../src/routes/review/dto';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const AUTHOR = UserId.create('55555555-5555-4555-8555-555555555555');
const ASSIGNEE = UserId.create('66666666-6666-4666-8666-666666666666');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 1, null, 'located');
}

/** A lookup that resolves NO user — models every referenced user having been deleted. */
const emptyLookup: UserLookup = () => null;

describe('review DTO mapping — deleted-user handling (FR-024)', () => {
  test('a comment whose author was deleted maps to author: null', () => {
    const item = new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'orphaned', AUTHOR, null, null, null, null, null, anchor());
    const dto = toReviewItemDto(item, [], emptyLookup, 'caller');
    expect(dto.author).toBeNull();
  });

  test('a task whose assignee and resolver were deleted maps them to null', () => {
    const item = new ReviewComment(
      ROOT, PROJECT, DOCUMENT, null, 'task', 'do it', AUTHOR, 'resolved', ASSIGNEE, null, new Date('2026-07-11T00:00:00Z'), null, anchor(),
    );
    const dto = toReviewItemDto(item, [], emptyLookup, 'caller');
    expect(dto.author).toBeNull();
    expect(dto.assignee).toBeNull();
    expect(dto.resolvedBy).toBeNull();
    // The item itself and its resolution survive — only the user references are nulled.
    expect(dto.status).toBe('resolved');
    expect(dto.resolvedAt).toBeDefined();
  });

  test('a present user still resolves to a reference', () => {
    const item = new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'hi', AUTHOR, null, null, null, null, null, anchor());
    const lookup: UserLookup = (id) => (id === AUTHOR.value ? { id: AUTHOR.value, displayName: 'Ada', avatarKey: null } : null);
    const dto = toReviewItemDto(item, [], lookup, 'caller');
    expect(dto.author).toEqual({ id: AUTHOR.value, displayName: 'Ada', avatarKey: null });
  });

  test('reactions from a deleted user still count (aggregation is user-independent)', () => {
    const item = new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'hi', AUTHOR, null, null, null, null, null, anchor());
    const reaction = new ReviewReaction(ReviewReactionId.create('88888888-8888-4888-8888-888888888888'), ROOT, ASSIGNEE, '👍');
    const [thread] = toThreads([item], [reaction], emptyLookup, 'caller');
    expect(thread.root.reactions).toEqual([
      { emoji: '👍', count: 1, reactedByMe: false, userIds: [ASSIGNEE.value] },
    ]);
  });
});
