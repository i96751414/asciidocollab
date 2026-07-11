import { InMemoryReviewCommentRepository } from './in-memory-review-comment.repository';
import { InMemoryReviewReactionRepository } from './in-memory-review-reaction.repository';
import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewReaction } from '../../../src/entities/review-reaction';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ReviewReactionId } from '../../../src/value-objects/ids/review-reaction-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ReviewAnchor } from '../../../src/value-objects/review/review-anchor';

const P1 = ProjectId.create('11111111-1111-4111-8111-111111111111');
const P2 = ProjectId.create('1111111a-1111-4111-8111-111111111111');
const DOC = DocumentId.create('22222222-2222-4222-8222-222222222222');
const AUTHOR = UserId.create('55555555-5555-4555-8555-555555555555');

function anchor() {
  return new ReviewAnchor(null, { prefix: '', exact: 'x', suffix: '' }, 1, null, 'located');
}
function root(id: string, project = P1): ReviewComment {
  return new ReviewComment(ReviewCommentId.create(id), project, DOC, null, 'comment', 'b', AUTHOR, null, null, null, null, null, anchor());
}
function reply(id: string, parent: string): ReviewComment {
  return new ReviewComment(ReviewCommentId.create(id), P1, DOC, ReviewCommentId.create(parent), 'comment', 'r', AUTHOR);
}

describe('InMemoryReviewCommentRepository', () => {
  test('findById is tenant-filtered', async () => {
    const repo = new InMemoryReviewCommentRepository();
    await repo.create(root('33333333-3333-4333-8333-333333333333', P1));
    const id = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
    expect(await repo.findById(P1, id)).not.toBeNull();
    expect(await repo.findById(P2, id)).toBeNull();
  });

  test('deleting a root cascades its replies', async () => {
    const repo = new InMemoryReviewCommentRepository();
    await repo.create(root('33333333-3333-4333-8333-333333333333'));
    await repo.create(reply('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333'));
    await repo.delete(P1, ReviewCommentId.create('33333333-3333-4333-8333-333333333333'));
    expect(await repo.countByDocument(P1, DOC)).toBe(0);
  });

  test('listByDocument hides resolved unless requested', async () => {
    const repo = new InMemoryReviewCommentRepository();
    const resolved = root('33333333-3333-4333-8333-333333333333');
    resolved.resolveAsComment(AUTHOR);
    await repo.create(resolved);
    expect(await repo.listByDocument(P1, DOC, { includeResolved: false })).toHaveLength(0);
    expect(await repo.listByDocument(P1, DOC, { includeResolved: true })).toHaveLength(1);
  });
});

describe('InMemoryReviewReactionRepository', () => {
  test('toggle inserts then removes the same triple (idempotent)', async () => {
    const repo = new InMemoryReviewReactionRepository();
    const commentId = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
    const make = () => new ReviewReaction(ReviewReactionId.create('88888888-8888-4888-8888-888888888888'), commentId, AUTHOR, '👍');
    await repo.toggle(make());
    expect(await repo.listForItems([commentId])).toHaveLength(1);
    await repo.toggle(make());
    expect(await repo.listForItems([commentId])).toHaveLength(0);
  });
});
