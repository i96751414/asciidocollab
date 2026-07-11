import { CreateReviewCommentUseCase } from '../../../src/use-cases/review/create-review-comment';
import { InMemoryReviewCommentRepository } from '../../ports/review/in-memory-review-comment.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ValidationError } from '../../../src/errors/common/validation-error';
import { AnchorInvalidError } from '../../../src/errors/review/anchor-invalid';
import { AUDIT_REVIEW_ITEM_CREATED } from '../../../src/audit-actions';
import { REVIEW_BODY_MAX_LEN } from '../../../src/constants/review';
import type { CreateReviewItemCommand } from '../../../src/use-cases/review/create-review-comment';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');

function command(overrides: Partial<CreateReviewItemCommand> = {}): CreateReviewItemCommand {
  return {
    kind: 'comment',
    body: 'Please tighten this 🙂',
    anchor: { relPos: null, quote: { prefix: 'a ', exact: 'passage', suffix: ' b' }, lineHint: 3, sectionId: null },
    ...overrides,
  };
}

describe('CreateReviewCommentUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: CreateReviewCommentUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new CreateReviewCommentUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
  });

  test('an editor creates a located comment and an audit entry is written', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, command());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.item.kind).toBe('comment');
      expect(result.value.item.anchor?.state).toBe('located');
      expect(result.value.item.authorId?.equals(EDITOR)).toBe(true);
    }
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_ITEM_CREATED)).toBe(true);
  });

  test('creating a task defaults its status to open', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, command({ kind: 'task' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.item.status).toBe('open');
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, DOCUMENT, command());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });

  test('an empty body is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, command({ body: '   ' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('an over-long body is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, command({ body: 'x'.repeat(REVIEW_BODY_MAX_LEN + 1) }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('a missing quote passage is rejected as an invalid anchor', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, command({
      anchor: { relPos: null, quote: { prefix: '', exact: '  ', suffix: '' }, lineHint: null, sectionId: null },
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(AnchorInvalidError);
  });
});
