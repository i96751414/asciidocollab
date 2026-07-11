import { ResolveReviewItemUseCase } from '../../../src/use-cases/review/resolve-review-item';
import { AssignTaskUseCase } from '../../../src/use-cases/review/assign-task';
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
import { ReviewOperationInvalidError } from '../../../src/errors/review/review-operation-invalid';
import { ValidationError } from '../../../src/errors/common/validation-error';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const REPLY = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const TASK = ReviewCommentId.create('55555555-5555-4555-8555-555555555555');
const EDITOR = UserId.create('66666666-6666-4666-8666-666666666666');
const NON_MEMBER = UserId.create('77777777-7777-4777-8777-777777777777');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'x', suffix: '' }, 1, null, 'located');
}

async function setup() {
  const reviewRepo = new InMemoryReviewCommentRepository();
  const memberRepo = new InMemoryProjectMemberRepository();
  const auditRepo = new InMemoryAuditLogRepository();
  await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
  return { reviewRepo, memberRepo, auditRepo };
}

describe('ResolveReviewItemUseCase — root-only guard', () => {
  test('rejects resolving a reply (resolution is thread-level)', async () => {
    const { reviewRepo, memberRepo, auditRepo } = await setup();
    await reviewRepo.create(new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'root', EDITOR, null, null, null, null, null, anchor()));
    await reviewRepo.create(new ReviewComment(REPLY, PROJECT, DOCUMENT, ROOT, 'comment', 'reply', EDITOR));
    const useCase = new ResolveReviewItemUseCase(reviewRepo, memberRepo, auditRepo);
    const result = await useCase.execute(EDITOR, PROJECT, REPLY);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewOperationInvalidError);
    // The reply must not have been stamped.
    const reply = await reviewRepo.findById(PROJECT, REPLY);
    expect(reply?.isResolved()).toBe(false);
  });
});

async function taskSetup() {
  const s = await setup();
  await s.reviewRepo.create(new ReviewComment(TASK, PROJECT, DOCUMENT, null, 'task', 'do it', EDITOR, 'open', null, null, null, null, anchor()));
  return s;
}

describe('AssignTaskUseCase — assignee + due-date validation', () => {
  test('rejects a non-member assignee', async () => {
    const { reviewRepo, memberRepo, auditRepo } = await taskSetup();
    const useCase = new AssignTaskUseCase(reviewRepo, memberRepo, auditRepo);
    const result = await useCase.execute(EDITOR, PROJECT, TASK, { assigneeId: NON_MEMBER.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('accepts a member assignee', async () => {
    const { reviewRepo, memberRepo, auditRepo } = await taskSetup();
    const useCase = new AssignTaskUseCase(reviewRepo, memberRepo, auditRepo);
    const result = await useCase.execute(EDITOR, PROJECT, TASK, { assigneeId: EDITOR.value });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.item.assigneeId?.equals(EDITOR)).toBe(true);
  });

  test('rejects an unparseable due date instead of persisting an Invalid Date', async () => {
    const { reviewRepo, memberRepo, auditRepo } = await taskSetup();
    const useCase = new AssignTaskUseCase(reviewRepo, memberRepo, auditRepo);
    const result = await useCase.execute(EDITOR, PROJECT, TASK, { assigneeId: EDITOR.value, dueDate: 'garbage' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });
});
