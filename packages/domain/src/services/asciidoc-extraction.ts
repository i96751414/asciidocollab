import type {
  DocumentTree,
  IncludeEdge,
  ProjectSymbol,
  Reference,
  UnresolvedInclude,
} from '../types/asciidoc';

/**
 * Pure reference/symbol extraction + include-graph and effective-level rules for
 * AsciiDoc — no CodeMirror, no Prisma. Consumed by the web symbol-index
 * projection and the domain `FindReferencesUseCase` / move-rename use cases.
 */

const XREF_RE = /<<([^,>\n]+)(?:,[^>\n]*)?>>|xref:([^[\n]+)\[/g;
const INCLUDE_RE = /^[ \t]*include::([^[\n]+)\[([^\]\n]*)\]/gm;
const IMAGE_RE = /image::?([^[\n]+)\[/g;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z][\w:.-]*)\[/g;
const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):/gm;
const HEADING_RE = /^(={1,6})\s+(.+)$/gm;

/** Auto-generate a section id from heading text (Asciidoctor-style). */
export function headingToId(title: string): string {
  return (
    '_' +
    title
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '_')
      .replaceAll(/^_+|_+$/g, '')
  );
}

/** Parse `leveloffset=+N` / `-N` / `N` from an include directive's attribute list. */
export function parseIncludeLevelOffset(attributes: string): number {
  const match = /leveloffset\s*=\s*([+-]?\d+)/.exec(attributes);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** Extract all references (xref/include/image/attributeRef) from a file's content. */
export function extractReferences(fileId: string, content: string): Reference[] {
  const references: Reference[] = [];

  for (const match of content.matchAll(XREF_RE)) {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (target) references.push({ kind: 'xref', target, fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(INCLUDE_RE)) {
    references.push({ kind: 'include', target: match[1].trim(), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(IMAGE_RE)) {
    references.push({ kind: 'image', target: match[1].trim(), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ATTR_REF_RE)) {
    references.push({ kind: 'attributeRef', target: match[1], fileId, range: rangeOf(match) });
  }
  return references;
}

/** Extract all definable symbols (sections/anchors/attributes) from a file's content. */
export function extractSymbols(fileId: string, content: string): ProjectSymbol[] {
  const symbols: ProjectSymbol[] = [];

  for (const match of content.matchAll(HEADING_RE)) {
    symbols.push({ kind: 'section', name: headingToId(match[2]), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ANCHOR_RE)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name) symbols.push({ kind: 'anchor', name, fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ATTR_DEF_RE)) {
    if (match[2] !== '!') symbols.push({ kind: 'attribute', name: match[1], fileId, range: rangeOf(match) });
  }
  return symbols;
}

/** Resolve a reference against the known symbols, or `'unresolved'`. */
export function resolveReference(reference: Reference, symbols: ProjectSymbol[]): ProjectSymbol | 'unresolved' {
  if (reference.kind === 'xref') {
    // Cross-file xrefs carry a `file.adoc#fragment` (or `#fragment`) target; match
    // against the fragment id, which is what the include tree's symbols are keyed by.
    const hashIndex = reference.target.indexOf('#');
    const target = hashIndex === -1 ? reference.target : reference.target.slice(hashIndex + 1);
    return symbols.find((symbol) => (symbol.kind === 'anchor' || symbol.kind === 'section') && symbol.name === target) ?? 'unresolved';
  }
  if (reference.kind === 'attributeRef') {
    // AsciiDoc attribute names are case-insensitive (Asciidoctor downcases them), so a
    // `{foo}` reference must resolve against a `:Foo:` definition.
    const target = reference.target.toLowerCase();
    return symbols.find((symbol) => symbol.kind === 'attribute' && symbol.name.toLowerCase() === target) ?? 'unresolved';
  }
  return 'unresolved';
}

/**
 * Build the transitive include graph from a root file. Cycle-guarded (a file is
 * visited once); each edge carries the `leveloffset=` declared on its include.
 *
 * @param rootFileId - The main/current file id.
 * @param readContent - Returns a file's content, or null if unavailable.
 * @param resolveInclude - Resolves an include target (from a file) to a file id, or null.
 *   SECURITY (Constitution IX): include `target`s are user-controlled, so this callback
 *   MUST sandbox them via `resolveSandboxedPath` (the web symbol index does) — this pure
 *   model deliberately performs no filesystem access and cannot confine paths itself.
 */
export function buildIncludeGraph(
  rootFileId: string,
  readContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
): DocumentTree {
  const nodes: string[] = [];
  const edges: IncludeEdge[] = [];
  const unresolved: UnresolvedInclude[] = [];
  const visited = new Set<string>();

  const walk = (fileId: string): void => {
    if (visited.has(fileId)) return;
    visited.add(fileId);
    nodes.push(fileId);

    const content = readContent(fileId);
    if (content === null) return;

    for (const match of content.matchAll(INCLUDE_RE)) {
      const target = match[1].trim();
      const range = rangeOf(match);
      const resolved = resolveInclude(fileId, target);
      if (resolved === null) {
        unresolved.push({ fromFile: fileId, target, range });
        continue;
      }
      edges.push({ from: fileId, to: resolved, includeDirectiveRange: range, leveloffset: parseIncludeLevelOffset(match[2]) });
      walk(resolved);
    }
  };

  walk(rootFileId);
  return { rootFileId, nodes, edges, unresolved };
}

/**
 * The level offset inherited by a file from its ancestors along the first
 * document-order path from the root (sum of edge `leveloffset`s). 0 for the root
 * or an unreachable file (FR-071).
 */
export function inheritedLevelOffset(tree: DocumentTree, fileId: string): number {
  if (fileId === tree.rootFileId) return 0;
  const edgesByChild = new Map<string, IncludeEdge>();
  for (const edge of tree.edges) {
    if (!edgesByChild.has(edge.to)) edgesByChild.set(edge.to, edge);
  }
  let offset = 0;
  let current = fileId;
  const guard = new Set<string>();
  while (current !== tree.rootFileId && !guard.has(current)) {
    guard.add(current);
    const edge = edgesByChild.get(current);
    if (!edge) return 0; // unreachable from root
    offset += edge.leveloffset;
    current = edge.from;
  }
  return offset;
}

function rangeOf(match: RegExpMatchArray): { from: number; to: number } {
  const from = match.index ?? 0;
  return { from, to: from + match[0].length };
}
