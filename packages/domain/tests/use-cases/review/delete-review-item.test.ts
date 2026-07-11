import { DeleteReviewItemUseCase } from '../../../src/use-cases/review/delete-review-item';
import { InMemoryReviewCommentRepository } from '../../ports/review/in-memory-review-comment.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewAnchor } from '../../../src/value-objects/review/review-anchor';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ReviewItemNotFoundError } from '../../../src/errors/review/review-item-not-found';
import { AUDIT_REVIEW_ITEM_DELETED } from '../../../src/audit-actions';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const REPLY = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');
const MISSING = ReviewCommentId.create('77777777-7777-4777-8777-777777777777');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 1, null, 'located');
}

function root(): ReviewComment {
  return new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'a root', EDITOR, null, null, null, null, null, anchor());
}

function reply(): ReviewComment {
  return new ReviewComment(REPLY, PROJECT, DOCUMENT, ROOT, 'comment', 'a reply', EDITOR);
}

describe('DeleteReviewItemUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: DeleteReviewItemUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new DeleteReviewItemUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(root());
    await reviewRepo.create(reply());
  });

  test('deleting a root removes its replies and writes an audit entry', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, ROOT);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deleted).toBe(true);
    expect(await reviewRepo.findById(PROJECT, ROOT)).toBeNull();
    expect(await reviewRepo.findById(PROJECT, REPLY)).toBeNull();
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_ITEM_DELETED)).toBe(true);
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, ROOT);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('deleting a missing item returns a not-found error', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, MISSING);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewItemNotFoundError);
  });
});
