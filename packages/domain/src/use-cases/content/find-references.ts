import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { ReferenceExtractor, Reference, TextRange } from '../../ports/asciidoc/reference-extractor';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/** A single usage of a symbol within a project file (FR-065 find-usages). */
export interface ReferenceUsage {
  /** The file containing the reference. */
  fileNodeId: FileNodeId;
  /** The referencing file's project-relative path (no leading slash). */
  path: string;
  /** The kind of reference. */
  kind: Reference['kind'];
  /** The reference's location within its file. */
  range: TextRange;
}

/** Strip leading slashes so a `/docs/a.adoc` FilePath becomes `docs/a.adoc`. */
function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
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
  /** Initializes the use case with the repositories, file store, and extractor it needs. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly extractor: ReferenceExtractor,
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
      .filter((node) => node.type.value === 'file' && /\.(adoc|asciidoc|asc|ad)$/i.test(node.name))
      .toSorted((a, b) => a.path.value.localeCompare(b.path.value));

    const target = symbolName.toLowerCase();
    const usages: ReferenceUsage[] = [];

    for (const node of documents) {
      const buffer = await this.fileStore.read(projectId, node.path);
      if (!buffer) continue;
      const path = stripLeadingSlash(node.path.value);

      const references = this.extractor.extractReferences(node.id.value, buffer.toString('utf8'));
      for (const reference of references) {
        const matches =
          (reference.kind === 'xref' && xrefAnchorId(reference.target) === symbolName) ||
          (reference.kind === 'attributeRef' && reference.target.toLowerCase() === target);
        if (matches) {
          usages.push({ fileNodeId: node.id, path, kind: reference.kind, range: reference.range });
        }
      }
    }

    return { success: true, value: usages };
  }
}
