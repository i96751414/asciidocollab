import { EditReviewItemUseCase } from '../../../src/use-cases/review/edit-review-item';
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
import { AUDIT_REVIEW_EDITED } from '../../../src/audit-actions';
import { REVIEW_BODY_MAX_LEN } from '../../../src/constants/review';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const ROOT = ReviewCommentId.create('33333333-3333-4333-8333-333333333333');
const MISSING = ReviewCommentId.create('44444444-4444-4444-8444-444444444444');
const AUTHOR = UserId.create('55555555-5555-4555-8555-555555555555');
const OTHER_EDITOR = UserId.create('66666666-6666-4666-8666-666666666666');
const VIEWER = UserId.create('77777777-7777-4777-8777-777777777777');

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 3, null, 'located');
}

function root(): ReviewComment {
  return new ReviewComment(ROOT, PROJECT, DOCUMENT, null, 'comment', 'original body', AUTHOR, null, null, null, null, null, anchor());
}

describe('EditReviewItemUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: EditReviewItemUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new EditReviewItemUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, AUTHOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, OTHER_EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(root());
  });

  test('the author edits the body, it is persisted, and the change is audited', async () => {
    const result = await useCase.execute(AUTHOR, PROJECT, ROOT, { body: 'revised body' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.item.body).toBe('revised body');
    const stored = await reviewRepo.findById(PROJECT, ROOT);
    expect(stored?.body).toBe('revised body');
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_EDITED)).toBe(true);
  });

  test('the body is trimmed before saving', async () => {
    const result = await useCase.execute(AUTHOR, PROJECT, ROOT, { body: '  padded  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.item.body).toBe('padded');
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, ROOT, { body: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('another editor (not the author) is denied and the body is unchanged', async () => {
    const result = await useCase.execute(OTHER_EDITOR, PROJECT, ROOT, { body: 'hijacked' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const stored = await reviewRepo.findById(PROJECT, ROOT);
    expect(stored?.body).toBe('original body');
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('a missing item is rejected as not found', async () => {
    const result = await useCase.execute(AUTHOR, PROJECT, MISSING, { body: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ReviewItemNotFoundError);
  });

  test('an empty body is rejected', async () => {
    const result = await useCase.execute(AUTHOR, PROJECT, ROOT, { body: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('an over-long body is rejected', async () => {
    const result = await useCase.execute(AUTHOR, PROJECT, ROOT, { body: 'x'.repeat(REVIEW_BODY_MAX_LEN + 1) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });
});
