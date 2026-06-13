import {
  buildIncludeGraph,
  extractSymbols,
  extractReferences,
  resolveReference,
  inheritedLevelOffset,
  resolveSandboxedPath,
  type DocumentTree,
  type ProjectSymbol,
  type Reference,
} from '@asciidocollab/shared';

/**
 * Client projection over the shared `asciidoc-model` (US8/US12). This is a
 * read-only cache derived from the shared extraction + include-graph rules — NOT
 * a second parser (architecture-migration-plan). It aggregates symbols/references
 * across the include tree rooted at the configured main file (or the open file
 * when none — FR-047) and resolves cross-file references. Include/image path
 * resolution goes through the shared `resolveSandboxedPath` (Constitution IX).
 */

/** Aggregated, resolvable view of the AsciiDoc symbols/references across a project. */
export interface ProjectSymbolIndex {
  /** The include graph rooted at the index root. */
  tree: DocumentTree;
  /** All symbols defined across the tree. */
  symbols: ProjectSymbol[];
  /** All references found across the tree. */
  references: Reference[];
  /**
   * Resolve an xref target to its defining symbol.
   *
   * @param target - The xref target id.
   * @returns The defining symbol, or `'unresolved'`.
   */
  resolveXref(target: string): ProjectSymbol | 'unresolved';
  /**
   * Resolve an attribute reference to its definition.
   *
   * @param name - The attribute name.
   * @returns The defining symbol, or `'unresolved'`.
   */
  resolveAttribute(name: string): ProjectSymbol | 'unresolved';
  /**
   * The level offset a file inherits along the include path (FR-071).
   *
   * @param fileId - Identifier of the file whose inherited offset is wanted.
   * @returns The accumulated inherited offset.
   */
  inheritedOffset(fileId: string): number;
}

/**
 * Build an include-target resolver from a project-relative path map. A target is
 * resolved relative to the referencing file's path, sandboxed (Constitution IX),
 * then looked up by path; out-of-sandbox or unknown targets resolve to null.
 *
 * @param pathOf - Maps a file id to its project-relative path.
 * @param idOfPath - Maps a project-relative path back to a file id.
 * @returns An `(fromFileId, target) => fileId | null` resolver.
 */
export function makeIncludeResolver(
  pathOf: (fileId: string) => string | null,
  idOfPath: (path: string) => string | null,
): (fromFileId: string, target: string) => string | null {
  return (fromFileId, target) => {
    const fromPath = pathOf(fromFileId);
    if (fromPath === null) return null;
    const resolved = resolveSandboxedPath(fromPath, target);
    return resolved.ok ? idOfPath(resolved.path) : null;
  };
}

/**
 * Build the project symbol index by walking the include graph from `rootFileId`.
 *
 * @param rootFileId - The main file (or open file when none configured).
 * @param getContent - Returns a file's (live or persisted) content, or null.
 * @param resolveInclude - Resolves an include target to a file id, or null.
 * @returns The aggregated, resolvable {@link ProjectSymbolIndex}.
 */
export function buildProjectSymbolIndex(
  rootFileId: string,
  getContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
): ProjectSymbolIndex {
  const tree = buildIncludeGraph(rootFileId, getContent, resolveInclude);

  const symbols: ProjectSymbol[] = [];
  const references: Reference[] = [];
  for (const fileId of tree.nodes) {
    const content = getContent(fileId);
    if (content === null) continue;
    symbols.push(...extractSymbols(fileId, content));
    references.push(...extractReferences(fileId, content));
  }

  return {
    tree,
    symbols,
    references,
    resolveXref: (target) =>
      resolveReference({ kind: 'xref', target, fileId: rootFileId, range: { from: 0, to: 0 } }, symbols),
    resolveAttribute: (name) =>
      resolveReference({ kind: 'attributeRef', target: name, fileId: rootFileId, range: { from: 0, to: 0 } }, symbols),
    inheritedOffset: (fileId) => inheritedLevelOffset(tree, fileId),
  };
}
