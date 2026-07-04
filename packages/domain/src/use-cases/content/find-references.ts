import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Logger } from '../../ports/observability/logger';
import { Reference, TextRange } from '../../types/asciidoc';
import { extractReferences, extractSymbols, definitionSymbols } from '@asciidocollab/asciidoc-core';
import { isAsciiDocumentFileName } from '../../value-objects/files/asciidoc-file-name';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { stripLeadingSlash } from '../file-tree/reference-rewrite';
import { resolveFileContent, liveContentDeps } from './live-content';
import { projectInheritedAttributes } from './project-inherited-attributes';

/** The kind of a usage: a reference macro, or the symbol's own definition site. */
export type UsageKind = Reference['kind'] | 'definition';

/**
 * Which family of symbol to find: an id/anchor (matched by `[[id]]` definitions
 * and `<<id>>`/`xref:…#id` references) or an attribute (`:attr:` definitions and
 * `{attr}` references). When omitted, both families are returned.
 */
export type FindSymbolKind = 'anchor' | 'attribute';

/** A single usage of a symbol within a project file (find-usages). */
export interface ReferenceUsage {
  /** The file containing the usage. */
  fileNodeId: FileNodeId;
  /** The file's project-relative path (no leading slash). */
  path: string;
  /** The kind of usage — a reference macro, or `definition` for the declaring `[[id]]`/`:attr:`. */
  kind: UsageKind;
  /** The usage's location within its file. */
  range: TextRange;
}

/** The id part of an xref target, dropping any `file.adoc#` prefix and `,label` suffix. */
function xrefAnchorId(target: string): string {
  const hashIndex = target.indexOf('#');
  return hashIndex === -1 ? target : target.slice(hashIndex + 1);
}

/**
 * Project-wide find-usages for a section id, block anchor, or attribute
 * scans every AsciiDoc file in the project and returns each
 * `<<id>>` / `xref:…#id` / `{attr}` reference to the given name. RBAC is
 * enforced here (Constitution: authorization in use cases): a non-member is
 * denied before any content is read.
 */
export class FindReferencesUseCase {
  /** Initializes the use case with the repositories and file store it needs. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    // Optional: when both are supplied, a file open in a live collab room is scanned using its
    // live Yjs content (what the editor shows) instead of the possibly-stale file store, so a
    // symbol the user just typed but has not saved is found.
    private readonly documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>,
    private readonly collaborativeContentReader?: CollaborativeContentReader,
    private readonly logger?: Logger,
    // Optional: the project repository, read only for the configured main file id. When supplied and
    // a main file is set, section ids are derived with the id-generation attributes each file
    // inherits from its ancestors (`idprefix`/`idseparator`/`sectids`), so an xref to a
    // parent-prefixed section id resolves — matching the preview and the editor's symbol index.
    private readonly projectRepo?: Pick<ProjectRepository, 'findById'>,
  ) {}

  /**
   * Lists every reference to `symbolName` across the project's documents.
   *
   * @param actorId - The user requesting usages (must be a project member).
   * @param projectId - The project to scan.
   * @param symbolName - The section id / anchor / attribute name to find.
   * @param symbolKind - Restrict results to ids/anchors or attributes; when
   *   omitted, both families are returned (so an id and an attribute that share
   *   a name both appear).
   * @returns The matching usages (ascending by file then offset), or
   *   `PermissionDeniedError` when the actor is not a project member.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    symbolName: string,
    symbolKind?: FindSymbolKind,
  ): Promise<Result<ReferenceUsage[], DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);
    const documents = nodes
      .filter((node) => node.type.value === 'file' && isAsciiDocumentFileName(node.name))
      .toSorted((a, b) => a.path.value.localeCompare(b.path.value));

    const target = symbolName.toLowerCase();
    const usages: ReferenceUsage[] = [];

    // The requested family is constant for the whole scan, so resolve it once up front.
    const wantAnchor = symbolKind === undefined || symbolKind === 'anchor';
    const wantAttribute = symbolKind === undefined || symbolKind === 'attribute';

    // Preload every document's content once: the include-graph inheritance walk needs the whole
    // project's content in hand, and the per-file scan below reads the same snapshot — the same files
    // this scan always read, just gathered up front.
    const contentDeps = this.contentDeps(); // build once; reused for every file in the scan
    const scanned: Array<{ node: (typeof documents)[number]; path: string; content: string }> = [];
    for (const node of documents) {
      const resolved = await resolveFileContent(contentDeps, projectId, node);
      if (!resolved) continue;
      scanned.push({ node, path: stripLeadingSlash(node.path.value), content: resolved.content });
    }

    // Attributes each file inherits from the documents that include it, so a section id derived below
    // reflects an `idprefix`/`idseparator`/`sectids` a parent set above the include — matching the
    // preview and the editor's symbol index, so a parent-prefixed section id resolves.
    const inherited = projectInheritedAttributes(
      scanned.map(({ node, path, content }) => ({ fileId: node.id.value, path, content })),
      await this.mainFileId(projectId),
    );

    for (const { node, path, content } of scanned) {
      // Per-file matches, kept in document order so navigation lists read top-to-bottom.
      const inFile: ReferenceUsage[] = [];

      // The defining `[[id]]` / `:attr:` / heading itself is a usage too, so a symbol that is declared
      // but not (yet) referenced still shows up — otherwise find-usages reports "not found" for it.
      // `definitionSymbols` is the single authority for what counts as a definition: it collapses the
      // section/anchor namespace overlap (a heading's auto id is an anchor-family definition unless an
      // explicit `[[id]]`/`[#id]` already declares that id).
      const symbols = extractSymbols(node.id.value, content, inherited.get(node.id.value));
      for (const symbol of definitionSymbols(symbols, symbolKind)) {
        const defines =
          (wantAnchor && (symbol.kind === 'anchor' || symbol.kind === 'section') && symbol.name === symbolName) ||
          (wantAttribute && symbol.kind === 'attribute' && symbol.name.toLowerCase() === target);
        if (defines) inFile.push({ fileNodeId: node.id, path, kind: 'definition', range: symbol.range });
      }

      for (const reference of extractReferences(node.id.value, content)) {
        const matches =
          (wantAnchor && reference.kind === 'xref' && xrefAnchorId(reference.target) === symbolName) ||
          (wantAttribute && reference.kind === 'attributeRef' && reference.target.toLowerCase() === target);
        if (matches) {
          inFile.push({ fileNodeId: node.id, path, kind: reference.kind, range: reference.range });
        }
      }

      inFile.sort((a, b) => a.range.from - b.range.from);
      usages.push(...inFile);
    }

    return { success: true, value: usages };
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
