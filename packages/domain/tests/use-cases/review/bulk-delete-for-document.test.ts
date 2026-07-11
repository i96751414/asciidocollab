import { BulkDeleteForDocumentUseCase } from '../../../src/use-cases/review/bulk-delete-for-document';
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
import { ReviewCountConflictError } from '../../../src/errors/review/review-count-conflict';
import { AUDIT_REVIEW_DOCUMENT_CLEARED } from '../../../src/audit-actions';
import type { BulkDeleteForDocumentCommand } from '../../../src/use-cases/review/bulk-delete-for-document';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const DOCUMENT = DocumentId.create('22222222-2222-4222-8222-222222222222');
const OTHER_DOC = DocumentId.create('88888888-8888-4888-8888-888888888888');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');

const confirmed: BulkDeleteForDocumentCommand = { confirm: true };

function anchor(): ReviewAnchor {
  return new ReviewAnchor(null, { prefix: '', exact: 'passage', suffix: '' }, 1, null, 'located');
}

function rootOn(id: string, documentId: DocumentId): ReviewComment {
  return new ReviewComment(
    ReviewCommentId.create(id), PROJECT, documentId, null, 'comment', 'body', EDITOR,
    null, null, null, null, null, anchor(),
  );
}

describe('BulkDeleteForDocumentUseCase', () => {
  let reviewRepo: InMemoryReviewCommentRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: BulkDeleteForDocumentUseCase;

  beforeEach(async () => {
    reviewRepo = new InMemoryReviewCommentRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new BulkDeleteForDocumentUseCase(reviewRepo, memberRepo, auditRepo);
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    await reviewRepo.create(rootOn('33333333-3333-4333-8333-333333333333', DOCUMENT));
    await reviewRepo.create(rootOn('44444444-4444-4444-8444-444444444444', DOCUMENT));
    await reviewRepo.create(rootOn('99999999-9999-4999-8999-999999999999', OTHER_DOC));
  });

  test('an editor clears a document and only that document, with an audit entry', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, confirmed);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deleted).toBe(2);
    expect(await reviewRepo.countByDocument(PROJECT, DOCUMENT)).toBe(0);
    expect(await reviewRepo.countByDocument(PROJECT, OTHER_DOC)).toBe(1);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === AUDIT_REVIEW_DOCUMENT_CLEARED)).toBe(true);
  });

  test('the delete is idempotent — a repeat removes 0', async () => {
    await useCase.execute(EDITOR, PROJECT, DOCUMENT, confirmed);
    const second = await useCase.execute(EDITOR, PROJECT, DOCUMENT, confirmed);
    expect(second.success).toBe(true);
    if (second.success) expect(second.value.deleted).toBe(0);
  });

  test('a matching expectedCount permits the delete', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, { confirm: true, expectedCount: 2 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deleted).toBe(2);
  });

  test('a stale expectedCount is rejected as a count conflict', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, { confirm: true, expectedCount: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ReviewCountConflictError);
      const conflict = result.error as ReviewCountConflictError;
      expect(conflict.expected).toBe(5);
      expect(conflict.actual).toBe(2);
    }
    expect(await reviewRepo.countByDocument(PROJECT, DOCUMENT)).toBe(2);
  });

  test('an unconfirmed command is rejected', async () => {
    const result = await useCase.execute(EDITOR, PROJECT, DOCUMENT, { confirm: false } as unknown as BulkDeleteForDocumentCommand);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('a viewer is denied and the denial is audited', async () => {
    expect.assertions(3);
    const result = await useCase.execute(VIEWER, PROJECT, DOCUMENT, confirmed);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    const audits = await auditRepo.findByProjectId(PROJECT);
    expect(audits.some((a) => a.action === 'authz.denied')).toBe(true);
  });
});
