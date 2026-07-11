import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  ReviewComment,
  ReviewCommentId,
  ReviewAnchor,
  ProjectId,
  DocumentId,
  UserId,
  Timestamps,
  ReviewCommentRepository,
  ListByDocumentOptions,
  ListByProjectFilters,
  ReviewItemKind,
  ReviewItemStatus,
  AnchorState,
} from '@asciidocollab/domain';

/**
 * Prisma-backed implementation of the `ReviewCommentRepository` interface.
 * Maps between domain `ReviewComment` aggregates and the `ReviewComment` table.
 * Every read and write is tenant-scoped by `projectId`; deleting a root relies on
 * the database `onDelete: Cascade` to remove its replies and reactions.
 */
export class PrismaReviewCommentRepository implements ReviewCommentRepository {
  /** Creates a new PrismaReviewCommentRepository. */
  constructor(
    /** The Prisma client used for database operations. */
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * @param comment - The review item to persist.
   */
  async create(comment: ReviewComment): Promise<void> {
    await this.prisma.reviewComment.create({ data: toPersistenceReviewComment(comment) });
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @param id - The review item identifier.
   * @returns The item if found within the project, null otherwise.
   */
  async findById(projectId: ProjectId, id: ReviewCommentId): Promise<ReviewComment | null> {
    const record = await this.prisma.reviewComment.findFirst({
      where: { id: id.value, projectId: projectId.value },
    });
    return record ? toDomainReviewComment(record) : null;
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @param documentId - The document to list items for.
   * @param options - When `includeResolved` is false, resolved roots are omitted (replies are kept).
   * @returns The document's review items within the project.
   */
  async listByDocument(
    projectId: ProjectId,
    documentId: DocumentId,
    options: ListByDocumentOptions,
  ): Promise<ReviewComment[]> {
    const where: Prisma.ReviewCommentWhereInput = {
      projectId: projectId.value,
      documentId: documentId.value,
    };
    if (!options.includeResolved) {
      // Omit resolved roots but keep replies (replies never carry a resolution stamp).
      where.OR = [{ parentId: { not: null } }, { resolvedAt: null }];
    }
    const records = await this.prisma.reviewComment.findMany({ where });
    return records.map(toDomainReviewComment);
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @param filters - Optional assignee, status, and document filters.
   * @returns The project's review items matching the filters.
   */
  async listByProject(projectId: ProjectId, filters: ListByProjectFilters): Promise<ReviewComment[]> {
    const where: Prisma.ReviewCommentWhereInput = { projectId: projectId.value };
    if (filters.assigneeId) where.assigneeId = filters.assigneeId.value;
    if (filters.status) where.status = toPrismaStatus(filters.status);
    if (filters.documentId) where.documentId = filters.documentId.value;
    const records = await this.prisma.reviewComment.findMany({ where });
    return records.map(toDomainReviewComment);
  }

  /**
   * @param comment - The review item whose changes to persist.
   */
  async update(comment: ReviewComment): Promise<void> {
    const data = toPersistenceReviewComment(comment);
    await this.prisma.reviewComment.update({ where: { id: comment.id.value }, data });
  }

  /**
   * Deletes one item within a project. Cross-tenant deletes are no-ops. The DB
   * cascade removes the item's replies and reactions.
   *
   * @param projectId - The owning project (tenant key).
   * @param id - The review item to delete.
   */
  async delete(projectId: ProjectId, id: ReviewCommentId): Promise<void> {
    await this.prisma.reviewComment.deleteMany({
      where: { id: id.value, projectId: projectId.value },
    });
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @param documentId - The document to clear.
   * @returns The number of items removed.
   */
  async deleteByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number> {
    const result = await this.prisma.reviewComment.deleteMany({
      where: { projectId: projectId.value, documentId: documentId.value },
    });
    return result.count;
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @returns The number of items removed.
   */
  async deleteByProject(projectId: ProjectId): Promise<number> {
    const result = await this.prisma.reviewComment.deleteMany({
      where: { projectId: projectId.value },
    });
    return result.count;
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @param documentId - The document to count items for.
   * @returns The number of items on the document.
   */
  async countByDocument(projectId: ProjectId, documentId: DocumentId): Promise<number> {
    return this.prisma.reviewComment.count({
      where: { projectId: projectId.value, documentId: documentId.value },
    });
  }

  /**
   * @param projectId - The owning project (tenant key).
   * @returns The number of items across the project.
   */
  async countByProject(projectId: ProjectId): Promise<number> {
    return this.prisma.reviewComment.count({ where: { projectId: projectId.value } });
  }
}

type ReviewCommentRecord = {
  id: string;
  projectId: string;
  documentId: string;
  parentId: string | null;
  kind: string;
  body: string;
  authorId: string | null;
  status: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  anchorRelPos: Uint8Array | null;
  anchorQuotePrefix: string | null;
  anchorQuoteExact: string | null;
  anchorQuoteSuffix: string | null;
  anchorLineHint: number | null;
  anchorSectionId: string | null;
  anchorState: string;
  createdAt: Date;
  updatedAt: Date;
};

function toPrismaKind(value: ReviewItemKind): 'COMMENT' | 'TASK' {
  if (value === 'comment') return 'COMMENT';
  if (value === 'task') return 'TASK';
  throw new Error(`Unknown review item kind: ${value}`);
}

function toDomainKind(value: string): ReviewItemKind {
  if (value === 'COMMENT') return 'comment';
  if (value === 'TASK') return 'task';
  throw new Error(`Unknown review item kind: ${value}`);
}

function toPrismaStatus(value: ReviewItemStatus): 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WONTFIX' {
  if (value === 'open') return 'OPEN';
  if (value === 'in_progress') return 'IN_PROGRESS';
  if (value === 'resolved') return 'RESOLVED';
  if (value === 'wontfix') return 'WONTFIX';
  throw new Error(`Unknown review item status: ${value}`);
}

function toDomainStatus(value: string | null): ReviewItemStatus | null {
  if (value === null) return null;
  if (value === 'OPEN') return 'open';
  if (value === 'IN_PROGRESS') return 'in_progress';
  if (value === 'RESOLVED') return 'resolved';
  if (value === 'WONTFIX') return 'wontfix';
  throw new Error(`Unknown review item status: ${value}`);
}

function toPrismaAnchorState(value: AnchorState): 'LOCATED' | 'SECTION' | 'DETACHED' {
  if (value === 'located') return 'LOCATED';
  if (value === 'section') return 'SECTION';
  if (value === 'detached') return 'DETACHED';
  throw new Error(`Unknown anchor state: ${value}`);
}

function toDomainAnchorState(value: string): AnchorState {
  if (value === 'LOCATED') return 'located';
  if (value === 'SECTION') return 'section';
  if (value === 'DETACHED') return 'detached';
  throw new Error(`Unknown anchor state: ${value}`);
}

function toDomainReviewComment(record: ReviewCommentRecord): ReviewComment {
  // A root with a captured passage carries an anchor; a reply (or a root without a
  // quoted passage) has none. All anchor columns collapse to a null domain anchor.
  const anchor =
    record.parentId === null && record.anchorQuoteExact !== null
      ? new ReviewAnchor(
          record.anchorRelPos === null ? null : new Uint8Array(record.anchorRelPos),
          {
            prefix: record.anchorQuotePrefix ?? '',
            exact: record.anchorQuoteExact,
            suffix: record.anchorQuoteSuffix ?? '',
          },
          record.anchorLineHint,
          record.anchorSectionId,
          toDomainAnchorState(record.anchorState),
        )
      : null;

  return new ReviewComment(
    ReviewCommentId.create(record.id),
    ProjectId.create(record.projectId),
    DocumentId.create(record.documentId),
    record.parentId ? ReviewCommentId.create(record.parentId) : null,
    toDomainKind(record.kind),
    record.body,
    record.authorId ? UserId.create(record.authorId) : null,
    toDomainStatus(record.status),
    record.assigneeId ? UserId.create(record.assigneeId) : null,
    record.dueDate,
    record.resolvedAt,
    record.resolvedById ? UserId.create(record.resolvedById) : null,
    anchor,
    new Timestamps(record.createdAt, record.updatedAt),
  );
}

function toPersistenceReviewComment(comment: ReviewComment): Prisma.ReviewCommentUncheckedCreateInput {
  const anchor = comment.anchor;
  const quote = anchor?.quote ?? null;
  const relativePos = anchor?.relPos ?? null;

  return {
    id: comment.id.value,
    projectId: comment.projectId.value,
    documentId: comment.documentId.value,
    parentId: comment.parentId?.value ?? null,
    kind: toPrismaKind(comment.kind),
    body: comment.body,
    authorId: comment.authorId?.value ?? null,
    status: comment.status === null ? null : toPrismaStatus(comment.status),
    assigneeId: comment.assigneeId?.value ?? null,
    dueDate: comment.dueDate,
    resolvedAt: comment.resolvedAt,
    resolvedById: comment.resolvedById?.value ?? null,
    anchorRelPos: relativePos === null ? null : Buffer.from(relativePos),
    anchorQuotePrefix: quote?.prefix ?? null,
    anchorQuoteExact: quote?.exact ?? null,
    anchorQuoteSuffix: quote?.suffix ?? null,
    anchorLineHint: anchor?.lineHint ?? null,
    anchorSectionId: anchor?.sectionId ?? null,
    anchorState: toPrismaAnchorState(anchor?.state ?? 'located'),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}
