import { ResolveReviewItemUseCase } from '../../../src/use-cases/review/resolve-review-item';
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
import { ReviewOperationInvalidError } from '../../../src/errors/review/review-operation-invalid';
import { AUDIT_REVIEW_RESOLVED, AUDIT_REVIEW_REOPENED } from '../../../src/audit-actions';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const COMMENT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const TASK = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const MISSING = ReviewCommentId.create('77777777-7777-4777-8777-777777777777');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 3, null, 'located');
}

function commentRoot(): ReviewComment {
  return new ReviewComment(COMMENT, PROJECT, DOCUMENT, null, 'comment', 'root body', EDITOR, null, null, null, null, null, anchor());
}

function taskRoot(): ReviewComment {
  return new ReviewComment(TASK, PROJECT, DOCUMENT, null, 'task', 'task body', EDITOR, 'open', null, null, null, null, anchor());
}

describe('ResolveReviewItemUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: ResolveReviewItemUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new ResolveReviewItemUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(commentRoot());
    await reviewRepo.create(taskRoot());
  });

  test('an editor resolves a comment thread and an audit entry is written', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, COMMENT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.item.isResolved()).toBe(true);
      expect(result.value.item.resolvedById?.equals(EDITOR)).toBe(true);
    }
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_RESOLVED)).toBe(true);
  });

  test('resolving is idempotent — a repeated resolve keeps the original stamp', async () => {
    const first = await useCase.execute(EDITOR, PROJECT, COMMENT);
    expect(first.success).toBe(true);
    const firstStamp = first.success ? first.value.item.resolvedAt?.getTime() : undefined;
    const second = await useCase.execute(EDITOR, PROJECT, COMMENT);
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.value.item.isResolved()).toBe(true);
      expect(second.value.item.resolvedAt?.getTime()).toBe(firstStamp);
    }
  });

  test('an editor reopens a resolved comment, clearing the stamp and auditing the reopen', async () => {
    await useCase.execute(EDITOR, PROJECT, COMMENT);
    const result = await useCase.execute(EDITOR, PROJECT, COMMENT, undefined, true);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.item.isResolved()).toBe(false);
      expect(result.value.item.resolvedById).toBeNull();
    }
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_REOPENED)).toBe(true);
  });

  test('reopening an already-open comment is an idempotent no-op', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, COMMENT, undefined, true);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.item.isResolved()).toBe(false);
  });

  test('reopening a task through the comment path is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, TASK, undefined, true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewOperationInvalidError);
  });

  test('resolving a task through the comment path is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, TASK);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewOperationInvalidError);
  });

  test('a missing item is rejected as not found', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, MISSING);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewItemNotFoundError);
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, COMMENT);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });
});
