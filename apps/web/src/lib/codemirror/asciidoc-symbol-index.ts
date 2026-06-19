import {
  buildIncludeGraphWithInheritance,
  extractSymbols,
  extractReferences,
  extractOwnAttributes,
  resolveReference,
  effectiveLevelOffset,
} from '../asciidoc/extraction';
import { resolveSandboxedPath } from '../asciidoc/sandbox-path';
import { RENDER_INTRINSIC_ATTRIBUTES } from '../asciidoc/render-intrinsics';
import type { DocumentTree, ProjectSymbol, Reference } from '@asciidocollab/shared';

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
  /**
   * The file currently open in the editor (whose live content is overlaid). Diagnostics scope to
   * this file, which may differ from the include-graph root when a separate main file is configured
   * (FR-045/047). Defaults to the root when not supplied.
   */
  activeFileId: string;
  /** All symbols defined across the tree. */
  symbols: ProjectSymbol[];
  /** All references found across the tree. */
  references: Reference[];
  /**
   * Attribute name (lowercase) → value across the entire tree (document order, last definition
   * wins). A project-wide view used for listing/completion; for resolving a SPECIFIC file's macro
   * targets prefer {@link ProjectSymbolIndex.effectiveAttributes}, which honours include scoping.
   */
  attributes: ReadonlyMap<string, string>;
  /**
   * The attributes a file inherits from the files that include it (its ancestors along the
   * include path from the root), capturing each ancestor's definitions that precede the include
   * directive leading to this file. Empty for the root and for files unreachable from it.
   *
   * @param fileId - Identifier of the file whose inherited attributes are wanted.
   * @returns The inherited attribute map (lowercase name → value); empty when none.
   */
  inheritedAttributes(fileId: string): ReadonlyMap<string, string>;
  /**
   * The effective attributes in scope for a file: the attributes it {@link inheritedAttributes
   * inherits} from its parents merged with its own definitions (the file's own win). This is the
   * map to use when substituting `{attr}` / `:imagesdir:` in that file's own include/image targets.
   *
   * @param fileId - Identifier of the file whose effective attributes are wanted.
   * @returns The effective attribute map (lowercase name → value).
   */
  effectiveAttributes(fileId: string): ReadonlyMap<string, string>;
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
  /**
   * The project-relative path of a file in the tree (for cross-file go-to-definition, FR-049).
   *
   * @param fileId - The file id to resolve.
   * @returns The project-relative path, or null when unknown.
   */
  pathOf(fileId: string): string | null;
  /**
   * The 1-based line number for a character offset within a file (reveal location, FR-049).
   *
   * @param fileId - The file the offset belongs to.
   * @param offset - The character offset into that file's content.
   * @returns The 1-based line number; 1 when the file's content is unavailable.
   */
  lineOf(fileId: string, offset: number): number;
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
 * @param activeFileId - The open file diagnostics should scope to; defaults to the root.
 * @param pathOf - Maps a file id to its project-relative path (for cross-file nav); defaults to none.
 * @returns The aggregated, resolvable {@link ProjectSymbolIndex}.
 */
export function buildProjectSymbolIndex(
  rootFileId: string,
  getContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
  activeFileId: string = rootFileId,
  pathOf: (fileId: string) => string | null = () => null,
): ProjectSymbolIndex {
  // Seed the render intrinsics so the include-graph walk gates conditional includes exactly as the
  // preview assembler does (e.g. an `ifdef::backend-html5[]` include is active) — keeping the symbol
  // index's nodes/edges and inherited attributes consistent with what is actually rendered (#4).
  const { tree, inheritedAttributes } = buildIncludeGraphWithInheritance(rootFileId, getContent, resolveInclude, RENDER_INTRINSIC_ATTRIBUTES);

  const symbols: ProjectSymbol[] = [];
  const references: Reference[] = [];
  const attributes = new Map<string, string>();
  for (const fileId of tree.nodes) {
    const content = getContent(fileId);
    if (content === null) continue;
    symbols.push(...extractSymbols(fileId, content));
    references.push(...extractReferences(fileId, content));
    // A file's OWN net attributes (in document order): `:name:` entries AND inline `{set:}`
    // assignments alike (FR-040), so a `{set:}`-defined name is project-wide known. Later files in
    // tree-node order win for the project-wide view (a coarse last-wins, as before).
    for (const [name, value] of extractOwnAttributes(content)) attributes.set(name, value);
  }

  const noAttributes: ReadonlyMap<string, string> = new Map();
  const inheritedAttributesOf = (fileId: string): ReadonlyMap<string, string> =>
    inheritedAttributes.get(fileId) ?? noAttributes;

  // `inheritedOffset` re-walks the whole include tree from the root (effectiveLevelOffset reads and
  // scans every file), and it is read on every editor render. Memoize per file for this index
  // instance so repeated reads are O(1); the index is rebuilt (new instance, fresh cache) whenever
  // content changes, so the cache can never go stale (#7).
  const offsetCache = new Map<string, number>();

  return {
    tree,
    activeFileId,
    symbols,
    references,
    attributes,
    inheritedAttributes: inheritedAttributesOf,
    effectiveAttributes: (fileId) => {
      const effective = new Map(inheritedAttributesOf(fileId));
      const content = getContent(fileId);
      // Apply the file's OWN definitions on top of what it inherits (own wins): `:name:` entries AND
      // inline `{set:}` assignments (FR-040), via the same document-order model the inheritance walk
      // uses — so an own `{set:basedir:...}` folds to its value just like a `:name:` entry.
      if (content !== null) {
        for (const [name, value] of extractOwnAttributes(content)) effective.set(name, value);
      }
      return effective;
    },
    resolveXref: (target) =>
      resolveReference({ kind: 'xref', target, fileId: rootFileId, range: { from: 0, to: 0 } }, symbols),
    resolveAttribute: (name) =>
      resolveReference({ kind: 'attributeRef', target: name, fileId: rootFileId, range: { from: 0, to: 0 } }, symbols),
    // The offset the editor applies to a non-root file's headings is the EFFECTIVE offset at its
    // first include point: the include `leveloffset=` options AND the attribute-form `:leveloffset:`
    // a parent declares above the include, include-scoped (FR-008/FR-009). `computeHeadingLevels`
    // (the single authority) then composes this base with the file's own attribute-form entries.
    inheritedOffset: (fileId) => {
      const cached = offsetCache.get(fileId);
      if (cached !== undefined) return cached;
      // Seed the render intrinsics so an include guarded by an Asciidoctor-injected attribute (e.g.
      // `ifdef::backend-html5[]`) is gated consistently with the preview assembler (FR-029/#3).
      const offset = effectiveLevelOffset({ rootFileId, fileId, readContent: getContent, resolveInclude, seedAttributes: RENDER_INTRINSIC_ATTRIBUTES });
      offsetCache.set(fileId, offset);
      return offset;
    },
    pathOf,
    lineOf: (fileId, offset) => {
      const content = getContent(fileId);
      if (content === null) return 1;
      let line = 1;
      for (let index = 0; index < offset && index < content.length; index += 1) {
        if (content[index] === '\n') line += 1;
      }
      return line;
    },
  };
}
