import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentEditor, ContentReplacement } from '../../ports/storage/collaborative-content-editor';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Document } from '../../entities/document';
import { resolveFileContent, liveContentDeps } from './live-content';
import { projectInheritedAttributes } from './project-inherited-attributes';
import { stripLeadingSlash } from '../file-tree/reference-rewrite';
import { definitionSymbols } from '@asciidocollab/asciidoc-core';
import { dedupeReplacements } from './content-replacements';
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

/**
 * Collapse a file's offset edits into the literal find→replace pairs the
 * collaborative editor applies. Every occurrence of an old symbol maps to the
 * same replacement, so deduping by `find` keeps the set minimal; the full
 * delimited slice (`[[intro]]`, `:intro:`, `<<intro,here>>`, `{intro}`) is used
 * as the find so the literal match stays specific to the symbol.
 */
function toReplacements(content: string, edits: Edit[]): ContentReplacement[] {
  return dedupeReplacements(edits.map((edit) => ({ find: content.slice(edit.from, edit.to), replace: edit.replacement })));
}

/** Input for {@link RenameSymbolUseCase}. */
export interface RenameSymbolInput {
  /** Whether the symbol is a block/section anchor (`<<id>>`) or a document attribute (`{attr}`). */
  symbolKind: RenamableSymbolKind;
  /** The current symbol name (id or attribute name). */
  oldName: string;
  /** The replacement name. */
  newName: string;
  /**
   * When true, the document already carries the new-name DEFINITION (the author renamed it in the
   * editor, feature 033) and only the lingering old-name references need rewriting. The scan must
   * therefore NOT treat the expected new-name definition as a merge conflict. Collision safety for
   * this mode is enforced by the caller (the in-editor suggestion blocks a genuine collision).
   * Defaults to false — the normal rename renames the definition too and guards against merges.
   */
  definitionAlreadyRenamed?: boolean;
  /**
   * In `definitionAlreadyRenamed` mode, whether the retyped definition is a section heading (its id is
   * a derived section id) rather than an explicit anchor/attribute. It matters for the new-name merge
   * count: a section is never counted (it is per-document and not rewritten), so the author's own
   * retyped heading contributes 0 — meaning ANY other rewritable definition of the new name is a
   * genuine collision. For a retyped anchor/attribute the author's own contributes 1, so the guard
   * only trips on a second. Lets the server reach the same collision verdict the client does instead
   * of being off by one for headings. Defaults to false. Ignored outside `definitionAlreadyRenamed`.
   */
  renamedDefinitionIsSection?: boolean;
}

/** Outcome of a successful rename. */
export interface RenameSymbolOutcome {
  /** How many files were edited. */
  rewrittenFiles: number;
  /** How many individual occurrences (definitions + references) were rewritten. */
  updatedReferences: number;
  /** Any occurrences that could not be safely rewritten (best-effort). */
  warnings: string[];
}

/**
 * Renames a section id / block anchor or a document attribute and rewrites every
 * `<<id>>` / `xref:` / `{attr}` reference to it across the project's documents
 * The match is by name across the project's document tree — the
 * same project-wide resolution scope as `FindReferencesUseCase`.
 *
 * Authorization is enforced here (Constitution: permission checks in use cases):
 * because the rename WRITES content in (possibly unopened) files, the caller must
 * be a project editor or owner. To avoid silently merging two distinct symbols,
 * the rename is refused when `newName` is already defined elsewhere (
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
    // Optional collab-safety dependencies. When `documentRepo` + `collaborativeContentEditor` are
    // supplied, a file open in a live room is rewritten through the Yjs source of truth instead of
    // the file store (avoids the live-clobber bug where the next writeback reverts a direct write).
    // When `collaborativeContentReader` is also supplied, the SCAN reads that file's live Yjs
    // content (what the editor shows) instead of the possibly-stale file store, so a symbol the
    // user just typed but has not saved is found and renamed.
    private readonly documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>,
    private readonly collaborativeContentEditor?: CollaborativeContentEditor,
    private readonly collaborativeContentReader?: CollaborativeContentReader,
    // Optional: the project repository, read only for the configured main file id. When supplied and
    // a main file is set, section ids are derived with the id-generation attributes each file
    // inherits from its ancestors (`idprefix`/`idseparator`/`sectids`), so the scan and its merge
    // guard see the same section ids the preview and editor do.
    private readonly projectRepo?: Pick<ProjectRepository, 'findById'>,
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

    const { symbolKind, oldName, newName, definitionAlreadyRenamed = false, renamedDefinitionIsSection = false } = input;
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
    // Content is read LIVE for files open in a collab room (see resolveFileContent),
    // so a symbol typed in the editor but not yet saved is still found.
    const staged: Array<{ node: FileNode; content: string; edits: Edit[]; document: Document | null }> = [];
    let conflictingNewDefinition = false;
    let oldStillDefined = false;
    let newNameDefinitions = 0;

    // Preload every document's content once: the include-graph inheritance walk needs the whole
    // project's content in hand, and the scan below reads the same snapshot — the same files this scan
    // always read, gathered up front so the rewrite pass can reuse them.
    const contentDeps = this.contentDeps(); // build once; reused for every file in the scan
    const scanned: Array<{ node: FileNode; content: string; document: Document | null }> = [];
    for (const node of documents) {
      const resolved = await resolveFileContent(contentDeps, projectId, node);
      if (!resolved) continue;
      scanned.push({ node, content: resolved.content, document: resolved.document });
    }

    // Attributes each file inherits from the documents that include it, so a section id derived below
    // reflects an `idprefix`/`idseparator`/`sectids` a parent set above the include — the scan and its
    // merge guard then see the same ids the preview renders.
    const inherited = projectInheritedAttributes(
      scanned.map(({ node, content }) => ({ fileId: node.id.value, path: stripLeadingSlash(node.path.value), content })),
      await this.mainFileId(projectId),
    );

    for (const { node, content, document } of scanned) {
      const symbols = extractSymbols(node.id.value, content, inherited.get(node.id.value));
      // `definitionSymbols` is the single authority for what defines a name in this family: for an
      // anchor rename it includes a heading's auto-generated section id (same xref namespace) but drops
      // a section whose id an explicit `[[id]]`/`[#id]` already declares, so one logical id is never
      // counted twice (which would falsely trip the merge guard below).
      const definitions = definitionSymbols(symbols, symbolKind);
      if (hasConflictingDefinition(symbols, symbolKind, matchesNew, matchesOld)) conflictingNewDefinition = true;
      // A section heading's auto-derived id is per-document: another file's independent `== Same Title`
      // that happens to derive the same id is a DISTINCT section, not the old symbol lingering — and
      // the rename never rewrites section headings (only references + explicit-anchor/attribute
      // definitions). So a section definition must NOT count as "old still defined", otherwise a
      // heading rename that carries a real reference is wrongly refused as a two-symbol merge (the
      // author renamed their own heading, the reference is real, yet Apply silently fails). An explicit
      // `[[id]]` anchor (or an attribute) DOES share a project-wide namespace, so it still counts.
      if (definitions.some((symbol) => symbol.kind !== 'section' && matchesOld(symbol.name))) oldStillDefined = true;
      // Same per-document reasoning for the NEW name: a section elsewhere deriving the new id is a
      // distinct section, not a colliding definition of this symbol (and is never rewritten). The
      // client's collision check ignores it too, so counting it here would make Apply silently fail on
      // a rename the suggestion presented as valid. Explicit-anchor duplicates of the new name still
      // count (and the client blocks those as collisions), so a genuine anchor merge is still refused.
      newNameDefinitions += definitions.filter((symbol) => symbol.kind !== 'section' && matchesNew(symbol.name)).length;

      const edits = computeEdits(symbolKind, oldName, newName, content, symbols, matchesOld);
      if (edits.length > 0) staged.push({ node, content, edits, document });
    }

    // A distinct new-name definition is a merge conflict for a normal rename. In
    // definition-already-renamed mode the author has already retyped the definition, so the expected
    // number of rewritable new-name definitions is exactly the author's own: 1 for a retyped
    // anchor/attribute, but 0 for a retyped section HEADING (a section is never counted — it is
    // per-document and not rewritten). Anything beyond that baseline is a genuine collision (a
    // pre-existing one, or one that raced in between the client's check and this write). Deriving the
    // baseline from `renamedDefinitionIsSection` lets the server reach the same verdict the client's
    // collision check does — instead of being off by one for headings — so it independently rejects a
    // merge rather than trusting the caller's flag.
    const newNameBaseline = renamedDefinitionIsSection ? 0 : 1;
    const merge = definitionAlreadyRenamed
      ? oldStillDefined || newNameDefinitions > newNameBaseline
      : conflictingNewDefinition;
    if (merge) {
      return {
        success: false,
        error: new ValidationError(`Cannot rename to "${newName}": a ${symbolKind} with that name already exists`),
      };
    }

    // Second pass: apply the staged edits. A file that is a live collaborative Document is
    // rewritten through the Yjs source of truth, not the file store: a direct file-store write
    // would be invisible to anyone editing it live AND overwritten by the next Yjs writeback,
    // silently reverting the rename (the same hazard the file-rename reference rewrite guards
    // against). Files never opened collaboratively keep the direct file-store path.
    let updatedReferences = 0;
    let rewrittenFiles = 0;
    const warnings: string[] = [];
    for (const { node, content, edits, document } of staged) {
      if (document && this.collaborativeContentEditor) {
        const applied = await this.collaborativeContentEditor.applyReplacements(
          projectId,
          document.yjsStateId,
          toReplacements(content, edits),
        );
        if (!applied.success) {
          // Do NOT fall back to a file-store write: if the room is live, the stale Y.Text would
          // overwrite it on the next writeback. Leave this file untouched and warn instead.
          warnings.push(`Could not apply collaborative rename in ${node.path.value}: ${applied.error.message}`);
          continue;
        }
        if (applied.value === 0) {
          // The transport succeeded but no occurrence matched the live Y.Text: the live document
          // diverged from the content we scanned (a concurrent edit, or a stale-read fallback).
          // Report it rather than counting a rename that did not actually take effect.
          warnings.push(`No occurrences rewritten in ${node.path.value}: the live document diverged from the scan`);
          continue;
        }
        updatedReferences += applied.value; // actual occurrences replaced in the live document
        rewrittenFiles += 1;
        continue;
      }

      // Apply right-to-left so earlier offsets stay valid as later slices are replaced.
      const next = applyEdits(content, edits);
      await this.fileStore.write(projectId, node.path, Buffer.from(next, 'utf8'));
      updatedReferences += edits.length;
      rewrittenFiles += 1;
    }

    await recordAuditSuccess(this.auditLogRepo, {
      actorId,
      projectId,
      action: AUDIT_SYMBOL_RENAMED,
      resourceType: 'Project',
      resourceId: projectId.value,
      metadata: { symbolKind, oldName, newName, rewrittenFiles },
      context,
    }, this.logger);

    return { success: true, value: { rewrittenFiles, updatedReferences, warnings } };
  }

  /** The configured main file id, or null when none is set or the project repo was not supplied. */
  private async mainFileId(projectId: ProjectId): Promise<string | null> {
    if (!this.projectRepo) return null;
    const project = await this.projectRepo.findById(projectId);
    return project?.mainFileNodeId?.value ?? null;
  }

  /** Assembles the optional live-content dependencies for {@link resolveFileContent}. */
  private contentDeps() {
    return liveContentDeps({
      fileStore: this.fileStore,
      ...(this.documentRepo && { documentRepo: this.documentRepo }),
      ...(this.collaborativeContentReader && { collaborativeContentReader: this.collaborativeContentReader }),
      ...(this.logger && { logger: this.logger }),
    });
  }
}
