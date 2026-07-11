import { AssignTaskUseCase } from '../../../src/use-cases/review/assign-task';
import { InMemoryReviewCommentRepository } from '../../ports/review/in-memory-review-comment.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ReviewComment } from '../../../src/entities/review-comment';
import { ReviewCommentId } from '../../../src/value-objects/ids/review-comment-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ReviewAnchor } from '../../../src/value-objects/review/review-anchor';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ReviewItemNotFoundError } from '../../../src/errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../../src/errors/review/review-operation-invalid';
import { AUDIT_REVIEW_ASSIGNED } from '../../../src/audit-actions';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');
const ASSIGNEE = UserId.create('77777777-7777-4777-8777-777777777777');
const COMMENT_ID = ReviewCommentId.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const TASK_ID = ReviewCommentId.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const MISSING_ID = ReviewCommentId.create('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: 'a ', exact: 'passage', suffix: ' b' }, 3, null, 'located');
}

function rootComment(): ReviewComment {
  return new ReviewComment(COMMENT_ID, PROJECT, DOCUMENT, null, 'comment', 'body', EDITOR, null, null, null, null, null, anchor());
}

function rootTask(): ReviewComment {
  return new ReviewComment(TASK_ID, PROJECT, DOCUMENT, null, 'task', 'body', EDITOR, 'open', null, null, null, null, anchor());
}

describe('AssignTaskUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: AssignTaskUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new AssignTaskUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, ASSIGNEE, Role.create('editor'), new Date()));
  });

  test('an editor assigns a task with a due date and audits it', async () => {
    await reviewRepo.create(rootTask());
    const result = await useCase.execute(EDITOR, PROJECT, TASK_ID, {
      assigneeId: ASSIGNEE.value,
      dueDate: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.item.assigneeId?.equals(ASSIGNEE)).toBe(true);
      expect(result.value.item.dueDate?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    }
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_ASSIGNED)).toBe(true);
  });

  test('an editor clears an existing assignee and due date', async () => {
    await reviewRepo.create(
      new ReviewComment(TASK_ID, PROJECT, DOCUMENT, null, 'task', 'body', EDITOR, 'open', ASSIGNEE, new Date('2026-01-01'), null, null, anchor()),
    );
    const result = await useCase.execute(EDITOR, PROJECT, TASK_ID, { assigneeId: null, dueDate: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.item.assigneeId).toBeNull();
      expect(result.value.item.dueDate).toBeNull();
    }
  });

  test('a comment cannot be assigned', async () => {
    await reviewRepo.create(rootComment());
    const result = await useCase.execute(EDITOR, PROJECT, COMMENT_ID, { assigneeId: ASSIGNEE.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewOperationInvalidError);
  });

  test('a viewer is denied and the denial is audited', async () => {
    await reviewRepo.create(rootTask());
    const result = await useCase.execute(VIEWER, PROJECT, TASK_ID, { assigneeId: ASSIGNEE.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('a missing item yields a not-found error', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, MISSING_ID, { assigneeId: ASSIGNEE.value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewItemNotFoundError);
  });
});
