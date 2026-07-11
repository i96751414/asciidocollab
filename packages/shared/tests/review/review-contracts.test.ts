import {
  REVIEW_BODY_MAX_LEN,
  REVIEW_ITEM_KINDS,
  REVIEW_ITEM_STATUSES,
  ANCHOR_STATES,
  isReviewItemKind,
  isReviewItemStatus,
  isAnchorState,
} from '../../src/review';
import type {
  ReviewItemDto,
  ThreadDto,
  AnchorDto,
  ReactionSummaryDto,
  CreateReviewItemInput,
  BulkDeleteDocumentInput,
} from '../../src/review';
import type { ReviewItemsChangedEventDto, ProjectEventDto } from '../../src/dtos';

describe('review shared contracts', () => {
  test('body-length constant is the single authority (4000)', () => {
    expect(REVIEW_BODY_MAX_LEN).toBe(4000);
  });

  test('enum value sets are exhaustive and lowercase', () => {
    expect(REVIEW_ITEM_KINDS).toEqual(['comment', 'task']);
    expect(REVIEW_ITEM_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'wontfix']);
    expect(ANCHOR_STATES).toEqual(['located', 'section', 'detached']);
  });

  test('type guards accept members and reject non-members', () => {
    expect(isReviewItemKind('task')).toBe(true);
    expect(isReviewItemKind('TASK')).toBe(false);
    expect(isReviewItemStatus('in_progress')).toBe(true);
    expect(isReviewItemStatus('done')).toBe(false);
    expect(isAnchorState('detached')).toBe(true);
    expect(isAnchorState('gone')).toBe(false);
  });

  test('a root task DTO takes the documented shape', () => {
    const anchor: AnchorDto = {
      relPos: 'AAAA',
      quote: { prefix: 'before ', exact: 'the passage', suffix: ' after' },
      lineHint: 42,
      sectionId: 'getting-started/overview',
      state: 'located',
    };
    const reactions: ReactionSummaryDto[] = [
      { emoji: '👍', count: 2, reactedByMe: true, userIds: ['u1', 'u2'] },
    ];
    const item: ReviewItemDto = {
      id: 'i1',
      documentId: 'd1',
      projectId: 'p1',
      kind: 'task',
      body: 'Please fix 🙂',
      author: { id: 'u1', displayName: 'Ada', avatarKey: 'initials' },
      status: 'open',
      assignee: { id: 'u2', displayName: 'Alan', avatarKey: null },
      dueDate: '2026-07-20',
      anchor,
      reactions,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    };
    const thread: ThreadDto = { root: item, replies: [] };
    expect(thread.root.kind).toBe('task');
    expect(thread.root.author?.displayName).toBe('Ada');
    expect(thread.root.anchor?.state).toBe('located');
  });

  test('a deleted author renders as a null reference', () => {
    const item: ReviewItemDto = {
      id: 'i2',
      documentId: 'd1',
      projectId: 'p1',
      kind: 'comment',
      body: 'orphaned',
      author: null,
      reactions: [],
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    };
    expect(item.author).toBeNull();
  });

  test('create + bulk-delete inputs take the documented shape', () => {
    const create: CreateReviewItemInput = {
      kind: 'comment',
      body: 'hi',
      anchor: { quote: { prefix: '', exact: 'x', suffix: '' } },
    };
    const bulk: BulkDeleteDocumentInput = { confirm: true, expectedCount: 3 };
    expect(create.anchor.quote.exact).toBe('x');
    expect(bulk.confirm).toBe(true);
  });

  test('review-items-changed is part of the project event union', () => {
    const event: ReviewItemsChangedEventDto = { type: 'review-items-changed', documentId: 'd1' };
    const asUnion: ProjectEventDto = event;
    expect(asUnion.type).toBe('review-items-changed');
  });
});
