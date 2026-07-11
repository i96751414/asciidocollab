import { ReplyToThreadUseCase } from '../../../src/use-cases/review/reply-to-thread';
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
import { ValidationError } from '../../../src/errors/common/validation-error';
import { ReviewItemNotFoundError } from '../../../src/errors/review/review-item-not-found';
import { ReviewOperationInvalidError } from '../../../src/errors/review/review-operation-invalid';
import { AUDIT_REVIEW_REPLIED } from '../../../src/audit-actions';
import { REVIEW_BODY_MAX_LEN } from '../../../src/constants/review';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const REPLY = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 3, null, 'located');
}

function root(): ReviewComment {
  return new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'root body', EDITOR, null, null, null, null, null, anchor());
}

describe('ReplyToThreadUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: ReplyToThreadUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new ReplyToThreadUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(root());
  });

  test('an editor appends a reply and an audit entry is written', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, ROOT, { body: 'a reply' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.reply.isReply()).toBe(true);
      expect(result.value.reply.parentId?.equals(ROOT)).toBe(true);
      expect(result.value.reply.documentId.equals(DOCUMENT)).toBe(true);
      expect(result.value.reply.kind).toBe('comment');
      expect(result.value.reply.authorId?.equals(EDITOR)).toBe(true);
    }
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_REPLIED)).toBe(true);
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, ROOT, { body: 'a reply' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('a missing root is rejected as not found', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, REPLY, { body: 'a reply' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewItemNotFoundError);
  });

  test('replying to a reply is rejected as an invalid operation', async () => {
    await reviewRepo.create(new ReviewComment(REPLY, PROJECT, DOCUMENT, ROOT, 'comment', 'existing reply', EDITOR));
    const result = await useCase.execute(EDITOR, PROJECT, REPLY, { body: 'nested reply' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewOperationInvalidError);
  });

  test('an empty body is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, ROOT, { body: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('an over-long body is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, ROOT, { body: 'x'.repeat(REVIEW_BODY_MAX_LEN + 1) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });
});
