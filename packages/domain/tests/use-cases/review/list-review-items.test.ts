import { ListReviewItemsUseCase } from '../../../src/use-cases/review/list-review-items';
import { InMemoryReviewCommentRepository } from '../../ports/review/in-memory-review-comment.repository';
import { InMemoryReviewReactionRepository } from '../../ports/review/in-memory-review-reaction.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewReaction } from '../../../src/entities/review-reaction';
import { ReviewAnchor } from '../../../src/value-objects/review/review-anchor';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ReviewReactionId } from '../../../src/value-objects/ids/review-reaction-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const REPLY = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const RESOLVED = ReviewCommentId.create('99999999-9999-4999-8999-999999999999');
const REACTION = ReviewReactionId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');
const OUTSIDER = UserId.create('88888888-8888-4888-8888-888888888888');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 3, null, 'located');
}

describe('ListReviewItemsUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let reactionRepo: InMemoryReviewReactionRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let useCase: ListReviewItemsUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    reactionRepo = new InMemoryReviewReactionRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    useCase = new ListReviewItemsUseCase(reviewRepo, reactionRepo, memberRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));

    const rootItem = new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'root body', EDITOR, null, null, null, null, null, anchor());
    await reviewRepo.create(rootItem);
    await reviewRepo.create(new ReviewComment(REPLY, PROJECT, DOCUMENT, ROOT, 'comment', 'a reply', EDITOR));

    const resolvedRoot = new ReviewComment(RESOLVED, PROJECT, DOCUMENT, null, 'comment', 'resolved body', EDITOR, null, null, null, null, null, anchor());
    resolvedRoot.resolveAsComment(EDITOR);
    await reviewRepo.create(resolvedRoot);

    await reactionRepo.toggle(new ReviewReaction(REACTION, ROOT, EDITOR, '👍'));
  });

  test('a viewer lists roots + replies with their reactions (resolved omitted by default)', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, DOCUMENT, { includeResolved: false });
    expect(result.success).toBe(true);
    if (result.success) {
      const ids = result.value.items.map((index) => index.id.value);
      expect(ids).toContain(ROOT.value);
      expect(ids).toContain(REPLY.value);
      expect(ids).not.toContain(RESOLVED.value);
      expect(result.value.reactions).toHaveLength(1);
      expect(result.value.reactions[0].emoji).toBe('👍');
    }
  });

  test('includeResolved surfaces resolved roots', async () => {
    const result = await useCase.execute(VIEWER, PROJECT, DOCUMENT, { includeResolved: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items.map((index) => index.id.value)).toContain(RESOLVED.value);
    }
  });

  test('a non-member is denied', async () => {
    const result = await useCase.execute(OUTSIDER, PROJECT, DOCUMENT, { includeResolved: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });
});
