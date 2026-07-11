import {
  DomainError,
  PermissionDeniedError,
  ValidationError,
  ReviewItemNotFoundError,
  AnchorInvalidError,
  ReviewOperationInvalidError,
  ReviewCountConflictError,
  ReviewComment,
  ReviewCommentId,
  ReviewAnchor,
  ProjectId,
  DocumentId,
  UserId,
} from '@asciidocollab/domain';
import { mapReviewError } from '../../../src/routes/review/errors';
import { buildUserLookup, collectUserIds } from '../../../src/routes/review/user-lookup';
import { toThreads } from '../../../src/routes/review/dto';

/** A DomainError the review error map does not recognise (exercises the opaque-500 fallback). */
class UnmappedError extends DomainError {
  readonly name = 'UnmappedError';
}

describe('mapReviewError', () => {
  test('maps each known review error to its status + wire code', () => {
    expect(mapReviewError(new PermissionDeniedError('x', 'ReviewComment', 'id'))).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(mapReviewError(new ReviewItemNotFoundError('id'))).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(mapReviewError(new AnchorInvalidError('bad'))).toEqual({ status: 400, code: 'ANCHOR_INVALID' });
    expect(mapReviewError(new ValidationError('bad'))).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(mapReviewError(new ReviewCountConflictError(1, 2))).toEqual({ status: 409, code: 'COUNT_CONFLICT' });
    expect(mapReviewError(new ReviewOperationInvalidError('no'))).toEqual({ status: 409, code: 'CONFLICT' });
  });

  test('falls back to an opaque 500 for an unrecognised domain error', () => {
    expect(mapReviewError(new UnmappedError('boom'))).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
  });
});

describe('buildUserLookup', () => {
  const PRESENT = '550e8400-e29b-41d4-a716-446655440001';
  const GONE = '550e8400-e29b-41d4-a716-446655440002';
  const NEVER = '550e8400-e29b-41d4-a716-446655440003';
  const present = { displayName: 'Ada', avatarKey: 'initial-face:5' };
  const userRepo = {
    findById: jest.fn(async (id: { value: string }) => (id.value === PRESENT ? present : null)),
  };

  test('resolves present users, and maps deleted/null ids to null', async () => {
    const lookup = await buildUserLookup(userRepo as never, [PRESENT, GONE, null, PRESENT]);
    expect(lookup(PRESENT)).toEqual({ id: PRESENT, displayName: 'Ada', avatarKey: 'initial-face:5' });
    expect(lookup(GONE)).toBeNull();
    expect(lookup(null)).toBeNull();
    expect(lookup(NEVER)).toBeNull();
    // Distinct ids only (PRESENT appeared twice) → one repo hit each.
    expect(userRepo.findById).toHaveBeenCalledTimes(2);
  });
});

const id = (n: number) => ReviewCommentId.create(`550e8400-e29b-41d4-a716-4466554400${20 + n}`);
const anchor = () =>
  new ReviewAnchor(new Uint8Array([1, 2, 3]), { prefix: '', exact: 'x', suffix: '' }, 1, null, 'located');

describe('toThreads', () => {
  const PROJECT = ProjectId.create('550e8400-e29b-41d4-a716-446655440010');
  const DOCUMENT = DocumentId.create('550e8400-e29b-41d4-a716-446655440011');
  const AUTHOR = UserId.create('550e8400-e29b-41d4-a716-446655440012');
  const root = (n: number) =>
    new ReviewComment(id(n), PROJECT, DOCUMENT, null, 'comment', `root ${n}`, AUTHOR, null, null, null, null, null, anchor());
  const reply = (n: number, parent: number) =>
    new ReviewComment(id(n), PROJECT, DOCUMENT, id(parent), 'comment', `reply ${n}`, AUTHOR);
  const lookup = () => ({ id: AUTHOR.value, displayName: 'Ada', avatarKey: null });

  test('groups replies under their roots and orders both by creation time', () => {
    // Two roots and two replies on the first root exercise both sort comparators.
    const items = [root(1), root(2), reply(3, 1), reply(4, 1)];
    const threads = toThreads(items, [], lookup, AUTHOR.value);
    expect(threads).toHaveLength(2);
    const first = threads.find((t) => t.root.id === id(1).value)!;
    expect(first.replies.map((r) => r.body)).toEqual(['reply 3', 'reply 4']);
    expect(threads.find((t) => t.root.id === id(2).value)!.replies).toHaveLength(0);
  });
});

describe('collectUserIds', () => {
  test('gathers author/assignee/resolver ids plus reactor ids', () => {
    const ids = collectUserIds(
      [{ authorId: { value: 'a' }, assigneeId: null, resolvedById: { value: 'r' } }],
      [{ userId: { value: 'x' } }],
    );
    expect(ids).toEqual(['a', null, 'r', 'x']);
  });
});
