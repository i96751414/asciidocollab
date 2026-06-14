import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Logger } from '../../ports/observability/logger';
import { Reference, TextRange } from '../../types/asciidoc';
import { extractReferences, extractSymbols } from '../../services/asciidoc-extraction';
import { isAsciiDocumentFileName } from '../../value-objects/files/asciidoc-file-name';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { stripLeadingSlash } from '../file-tree/reference-rewrite';
import { resolveFileContent, liveContentDeps } from './live-content';

/** The kind of a usage: a reference macro, or the symbol's own definition site. */
export type UsageKind = Reference['kind'] | 'definition';

/** A single usage of a symbol within a project file (FR-065 find-usages). */
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
 * (US12/FR-065): scans every AsciiDoc file in the project and returns each
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
  ) {}

  /**
   * Lists every reference to `symbolName` across the project's documents.
   *
   * @param actorId - The user requesting usages (must be a project member).
   * @param projectId - The project to scan.
   * @param symbolName - The section id / anchor / attribute name to find.
   * @returns The matching usages (ascending by file then offset), or
   *   `PermissionDeniedError` when the actor is not a project member.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    symbolName: string,
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

    const contentDeps = this.contentDeps(); // build once; reused for every file in the scan
    for (const node of documents) {
      const resolved = await resolveFileContent(contentDeps, projectId, node);
      if (!resolved) continue;
      const { content } = resolved;
      const path = stripLeadingSlash(node.path.value);

      // Per-file matches, kept in document order so navigation lists read top-to-bottom.
      const inFile: ReferenceUsage[] = [];

      // The defining `[[id]]` / `:attr:` itself is a usage too, so a symbol that is declared but
      // not (yet) referenced still shows up — otherwise find-usages reports "not found" for it.
      for (const symbol of extractSymbols(node.id.value, content)) {
        const defines =
          (symbol.kind === 'anchor' && symbol.name === symbolName) ||
          (symbol.kind === 'attribute' && symbol.name.toLowerCase() === target);
        if (defines) {
          inFile.push({ fileNodeId: node.id, path, kind: 'definition', range: symbol.range });
        }
      }

      for (const reference of extractReferences(node.id.value, content)) {
        const matches =
          (reference.kind === 'xref' && xrefAnchorId(reference.target) === symbolName) ||
          (reference.kind === 'attributeRef' && reference.target.toLowerCase() === target);
        if (matches) {
          inFile.push({ fileNodeId: node.id, path, kind: reference.kind, range: reference.range });
        }
      }

      inFile.sort((a, b) => a.range.from - b.range.from);
      usages.push(...inFile);
    }

    return { success: true, value: usages };
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
