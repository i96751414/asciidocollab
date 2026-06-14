import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { recordAuthorizationDenial, recordAuditSuccess } from '../audit-recording';
import { AUDIT_SYMBOL_RENAMED } from '../../audit-actions';
import { isAsciiDocumentFileName } from '../../value-objects/files/asciidoc-file-name';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { ValidationError } from '../../errors/common/validation-error';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { FileNode } from '../../entities/file-node';
import { RenamableSymbolKind, isValidNewName } from './rename-symbol-validation';
import {
  Edit,
  applyEdits,
  computeEdits,
  extractSymbols,
  hasConflictingDefinition,
  nameMatcher,
} from './rename-symbol-rewrite';

export type { RenamableSymbolKind } from './rename-symbol-validation';

/** Input for {@link RenameSymbolUseCase}. */
export interface RenameSymbolInput {
  /** Whether the symbol is a block/section anchor (`<<id>>`) or a document attribute (`{attr}`). */
  symbolKind: RenamableSymbolKind;
  /** The current symbol name (id or attribute name). */
  oldName: string;
  /** The replacement name. */
  newName: string;
}

/** Outcome of a successful rename. */
export interface RenameSymbolOutcome {
  /** How many files were edited. */
  rewrittenFiles: number;
  /** How many individual occurrences (definitions + references) were rewritten. */
  updatedReferences: number;
  /** Any occurrences that could not be safely rewritten (best-effort, FR-067). */
  warnings: string[];
}

/**
 * Renames a section id / block anchor or a document attribute and rewrites every
 * `<<id>>` / `xref:` / `{attr}` reference to it across the project's documents
 * (US12/FR-064). The match is by name across the project's document tree — the
 * same project-wide resolution scope as `FindReferencesUseCase` (FR-065).
 *
 * Authorization is enforced here (Constitution: permission checks in use cases):
 * because the rename WRITES content in (possibly unopened) files, the caller must
 * be a project editor or owner. To avoid silently merging two distinct symbols,
 * the rename is refused when `newName` is already defined elsewhere (SC-020:
 * warn before breaking). Each file's edits are computed first and only applied
 * once the whole project has been scanned and found conflict-free.
 *
 * This file is a thin orchestrator: new-name validation lives in
 * `rename-symbol-validation`, and the scan/apply/conflict text logic in
 * `rename-symbol-rewrite`; RBAC, persistence and audit logging stay here.
 */
export class RenameSymbolUseCase {
  /** Initializes the use case with the repositories, file store and audit log it needs. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Renames `oldName` to `newName` across the project.
   *
   * @param actorId - The user requesting the rename (must be editor/owner).
   * @param projectId - The project to refactor.
   * @param input - The symbol kind and old/new names.
   * @param context - Optional request origin for audit metadata.
   * @returns The rename outcome, or a typed domain error.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: RenameSymbolInput,
    context?: RequestContext,
  ): Promise<Result<RenameSymbolOutcome, DomainError>> {
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

    const { symbolKind, oldName, newName } = input;
    if (!isValidNewName(symbolKind, newName)) {
      return { success: false, error: new ValidationError(`Invalid ${symbolKind} name: "${newName}"`) };
    }

    if (oldName === newName) {
      return { success: true, value: { rewrittenFiles: 0, updatedReferences: 0, warnings: [] } };
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);
    const documents = nodes
      .filter((node) => node.type.value === 'file' && isAsciiDocumentFileName(node.name))
      .toSorted((a, b) => a.path.value.localeCompare(b.path.value));

    const matchesNew = nameMatcher(symbolKind, newName);
    const matchesOld = nameMatcher(symbolKind, oldName);

    // First pass: scan every document, detect any conflicting definition of the
    // new name, and stage the edits for files that reference/define the old name.
    const staged: Array<{ node: FileNode; content: string; edits: Edit[] }> = [];
    let conflict = false;

    for (const node of documents) {
      const buffer = await this.fileStore.read(projectId, node.path);
      if (!buffer) continue;
      const content = buffer.toString('utf8');

      const symbols = extractSymbols(node.id.value, content);
      if (hasConflictingDefinition(symbols, symbolKind, matchesNew, matchesOld)) {
        conflict = true;
      }

      const edits = computeEdits(symbolKind, oldName, newName, content, symbols, matchesOld);
      if (edits.length > 0) staged.push({ node, content, edits });
    }

    if (conflict) {
      return {
        success: false,
        error: new ValidationError(`Cannot rename to "${newName}": a ${symbolKind} with that name already exists`),
      };
    }

    // Second pass: apply the staged edits (right-to-left so offsets stay valid).
    let updatedReferences = 0;
    for (const { node, content, edits } of staged) {
      const next = applyEdits(content, edits);
      await this.fileStore.write(projectId, node.path, Buffer.from(next, 'utf8'));
      updatedReferences += edits.length;
    }

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: AUDIT_SYMBOL_RENAMED,
      resourceType: 'Project',
      resourceId: projectId.value,
      metadata: { symbolKind, oldName, newName, rewrittenFiles: staged.length },
      context,
    }, this.logger);

    return { success: true, value: { rewrittenFiles: staged.length, updatedReferences, warnings: [] } };
  }
}
