import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { FileNode } from '../../entities/file-node';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { StructuredCollaborativeEditor } from '../../ports/storage/structured-collaborative-editor';
import { RegexEngine, MatchBudget } from '../../ports/text/regex-engine';
import { Logger } from '../../ports/observability/logger';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { SearchQuery, ReplaceSelection } from '../../types/search';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { AUDIT_PROJECT_CONTENT_REPLACED } from '../../audit-actions';
import { computeMatches, selectSpans } from './text-match';

// Domain-owned contracts, defined beside their producer (no `@asciidocollab/shared` import).

/** How far a replace applies; recorded for audit and shown in the confirmation. */
export type ReplaceScope = 'match' | 'file' | 'project';

/** One file's confirmed selections to replace. */
export interface FileReplaceSelection {
  /** The file to replace within. */
  readonly fileNodeId: FileNodeId;
  /** The confirmed `{ordinal, expectedText}` selections for this file. */
  readonly selections: ReadonlyArray<ReplaceSelection>;
}

/** Why a file could not be (fully) replaced. */
export type ReplaceSkipReason = 'stale' | 'diverged' | 'not-editable';

/** The outcome of a project-wide replace. */
export interface ReplaceOutcome {
  /** Total occurrences actually replaced across all files. */
  readonly replacedCount: number;
  /** Number of files changed. */
  readonly affectedFiles: number;
  /** Files that were skipped, with the reason. */
  readonly skipped: ReadonlyArray<{ fileNodeId: FileNodeId; reason: ReplaceSkipReason }>;
}

/** Input to the project-wide replace use case. */
export interface ReplaceProjectContentInput {
  /** The query, re-evaluated server-side against live content. */
  readonly query: SearchQuery;
  /** Literal replacement text, or a capture-group template in regex mode. */
  readonly replacement: string;
  /** The intended scope (for the audit record and the client confirmation). */
  readonly scope: ReplaceScope;
  /** The per-file confirmed selections; excluded matches are simply absent. */
  readonly files: ReadonlyArray<FileReplaceSelection>;
}

const APPLY_BUDGET_MS = 1000;
const APPLY_MAX_MATCHES = 1_000_000;

/**
 * Reviewed project-wide replace. RBAC is enforced here (editor/owner only; a
 * denial is audit-logged). A user-supplied regex is compiled on the injected
 * linear-time engine and rejected up front if invalid (`INVALID_PATTERN`). Every
 * edit is applied through the Yjs source of truth via
 * {@link StructuredCollaborativeEditor} — open sessions get it live, dormant
 * files are loaded/edited/written back — falling back to a direct file-store
 * write only for a file that has no `Document` record at all. Stale/diverged
 * files are skipped and reported, never force-written. The operation is recorded
 * with {@link AUDIT_PROJECT_CONTENT_REPLACED}.
 */
export class ReplaceProjectContentUseCase {
  /** Initializes the use case with the repositories, stores, engine, and apply port it needs. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly regexEngine: RegexEngine,
    private readonly structuredCollaborativeEditor: StructuredCollaborativeEditor,
    private readonly documentRepo: Pick<DocumentRepository, 'findByFileNodeId'>,
    private readonly logger?: Logger,
  ) {}

  /**
   * Applies the confirmed selections across the project.
   *
   * @param actorId - The user requesting the replace (must be editor/owner).
   * @param projectId - The project to replace within.
   * @param input - The query, replacement, scope, and per-file selections.
   * @param context - Request context for the audit record.
   * @returns The replace outcome, or `PermissionDeniedError` (not authorized) or
   *   `ValidationError` (invalid regex pattern).
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: ReplaceProjectContentInput,
    context?: RequestContext,
  ): Promise<Result<ReplaceOutcome, DomainError>> {
    const membership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    const role = membership?.role.value;
    if (role !== 'owner' && role !== 'editor') {
      await recordAuthorizationDenial(this.auditLogRepo, {
        actorId,
        projectId,
        resourceType: 'Project',
        resourceId: projectId.value,
        reason: 'not_authorized',
        context,
      }, this.logger);
      return { success: false, error: new PermissionDeniedError() };
    }

    // Reject an invalid pattern up front (before any file is touched). Literal mode needs no engine.
    if (input.query.mode === 'regex') {
      const compiled = this.regexEngine.compile(input.query.text, {
        caseSensitive: input.query.caseSensitive,
        multiline: true,
      });
      if (!compiled.success) return { success: false, error: compiled.error };
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);
    const nodeById = new Map(nodes.map((node) => [node.id.value, node]));

    const skipped: { fileNodeId: FileNodeId; reason: ReplaceSkipReason }[] = [];
    let replacedCount = 0;
    let affectedFiles = 0;

    for (const fileSelection of input.files) {
      if (fileSelection.selections.length === 0) continue;

      // Data isolation: the file MUST belong to this project. Guarding both apply paths (not just the
      // file-store fallback) stops a caller from targeting another project's document by id.
      const node = nodeById.get(fileSelection.fileNodeId.value);
      if (!node) {
        skipped.push({ fileNodeId: fileSelection.fileNodeId, reason: 'not-editable' });
        continue;
      }

      const document = await this.documentRepo.findByFileNodeId(fileSelection.fileNodeId);

      if (document) {
        const applied = await this.structuredCollaborativeEditor.applyStructuredReplacement(
          projectId,
          document.yjsStateId,
          { query: input.query, replacement: input.replacement, selections: fileSelection.selections },
        );
        if (!applied.success) {
          this.logger?.warn('Structured replace delivery failed', { error: applied.error.message });
          skipped.push({ fileNodeId: fileSelection.fileNodeId, reason: 'not-editable' });
          continue;
        }
        if (applied.value === 0) {
          skipped.push({ fileNodeId: fileSelection.fileNodeId, reason: 'diverged' });
          continue;
        }
        replacedCount += applied.value;
        affectedFiles += 1;
        continue;
      }

      // No Document record — a file never opened collaboratively. Apply directly to the file store.
      const applied = await this.applyToFileStore(projectId, node.path, input, fileSelection.selections);
      if (applied.reason) {
        skipped.push({ fileNodeId: fileSelection.fileNodeId, reason: applied.reason });
        continue;
      }
      replacedCount += applied.count;
      affectedFiles += 1;
    }

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: AUDIT_PROJECT_CONTENT_REPLACED,
      resourceType: 'Project',
      resourceId: projectId.value,
      metadata: { scope: input.scope, mode: input.query.mode, replacedCount, affectedFiles },
      context,
    }, this.logger);

    return { success: true, value: { replacedCount, affectedFiles, skipped } };
  }

  /** Applies the confirmed selections to a never-opened file directly in the file store. */
  private async applyToFileStore(
    projectId: ProjectId,
    path: FileNode['path'],
    input: ReplaceProjectContentInput,
    selections: ReadonlyArray<ReplaceSelection>,
  ): Promise<{ count: number; reason?: ReplaceSkipReason }> {
    const buffer = await this.fileStore.read(projectId, path);
    if (!buffer) return { count: 0, reason: 'not-editable' };
    const content = buffer.toString('utf8');
    const budget: MatchBudget = { maxMatches: APPLY_MAX_MATCHES, deadline: Date.now() + APPLY_BUDGET_MS };
    const matched = computeMatches(content, input.query, this.regexEngine, budget);
    if (!matched.success) return { count: 0, reason: 'not-editable' };
    const edits = selectSpans(matched.value, selections, input.replacement, input.query.mode);
    if (edits.length === 0) return { count: 0, reason: 'stale' };

    let next = content;
    for (const edit of edits) {
      next = next.slice(0, edit.from) + edit.replacement + next.slice(edit.to);
    }
    await this.fileStore.write(projectId, path, Buffer.from(next, 'utf8'));
    return { count: edits.length };
  }
}
