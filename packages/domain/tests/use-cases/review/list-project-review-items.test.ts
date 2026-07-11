import { ListProjectReviewItemsUseCase } from '../../../src/use-cases/review/list-project-review-items';
import { InMemoryReviewCommentRepository } from '../../ports/review/in-memory-review-comment.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ReviewAnchor } from '../../../src/value-objects/review/review-anchor';
import { ReviewItemStatus } from '../../../src/constants/review';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOC_A = DocumentId.create('22222222-2222-4222-8222-222222222222');
const DOC_B = DocumentId.create('33333333-3333-4333-8333-333333333333');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');
const STRANGER = UserId.create('99999999-9999-4999-8999-999999999999');
const ALICE = UserId.create('77777777-7777-4777-8777-777777777777');
const BOB = UserId.create('88888888-8888-4888-8888-888888888888');

let seq = 0;
function nextId(): ReviewCommentId {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return ReviewCommentId.create(`aaaaaaaa-aaaa-4aaa-8aaa-${hex}`);
}

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 1, null, 'located');
}

function task(documentId: DocumentId, status: ReviewItemStatus, assignee: UserId | null): ReviewComment {
  return new ReviewComment(nextId(), PROJECT, documentId, null, 'task', 'body', VIEWER, status, assignee, null, null, null, anchor());
}

describe('ListProjectReviewItemsUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let useCase: ListProjectReviewItemsUseCase;

  beforeEach(async () => {
    seq = 0;
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    useCase = new ListProjectReviewItemsUseCase(reviewRepo, memberRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(task(DOC_A, 'open', ALICE));
    await reviewRepo.create(task(DOC_A, 'resolved', BOB));
    await reviewRepo.create(task(DOC_B, 'open', ALICE));
  });

  test('a viewer lists every project item unfiltered', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, {});
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.items).toHaveLength(3);
  });

  test('filtering by assignee returns only that user\'s items', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, { assigneeId: ALICE.value });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items.every((index) => index.assigneeId?.equals(ALICE))).toBe(true);
    }
  });

  test('filtering by status returns only matching items', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, { status: 'resolved' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0].status).toBe('resolved');
    }
  });

  test('filtering by document scopes the result', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, { documentId: DOC_B.value });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0].documentId.equals(DOC_B)).toBe(true);
    }
  });

  test('a non-member is denied', async () => {
    const result = await useCase.execute(STRANGER, PROJECT, {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });
});
