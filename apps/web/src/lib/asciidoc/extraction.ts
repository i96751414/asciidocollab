import type {
  DocumentTree,
  IncludeEdge,
  ProjectSymbol,
  Reference,
  UnresolvedInclude,
} from '@asciidocollab/shared';
import { substitutePathAttributes } from './include-path';

/**
 * Editor-side (presentation) AsciiDoc reference/symbol extraction + include-graph,
 * used by the live editor: completions, diagnostics over the open buffer, and the
 * client symbol index. The authoritative copy of these structural rules lives in
 * the domain (`@asciidocollab/domain`, used server-side for find-references and
 * move/rename rewriting); this client copy operates on the live, unsaved buffer
 * where a server round-trip per keystroke is not viable. The DTO shapes are the
 * shared contracts so both copies agree on the data. Keep the two in sync.
 */

const XREF_RE = /<<([^,>\n]+)(?:,[^>\n]*)?>>|xref:([^[\n]+)\[/g;
const INCLUDE_RE = /^[ \t]*include::([^[\n]+)\[([^\]\n]*)\]/gm;
const IMAGE_RE = /image::?([^[\n]+)\[/g;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z][\w:.-]*)\[/g;
const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):/gm;
// Attribute definition WITH its value: `:name: value` (an unset `:name!:` does not match).
const ATTR_DEF_VALUE_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*(.*?)[ \t]*$/gm;
const HEADING_RE = /^(={1,6})\s+(.+)$/gm;
// An explicit block id (`[#id]` or `[[id]]`) on its own line. When it sits
// immediately above a heading it overrides the auto-generated section id.
const SECTION_ID_ATTR_RE = /^[ \t]*\[(?:#([A-Za-z][\w:.-]*)|\[([A-Za-z][\w:.-]*)\])\][ \t]*$/;

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

/**
 * The explicit id declared on the block-attribute line immediately above a
 * heading (Asciidoctor lets `[#id]`/`[[id]]` override a section's auto-generated
 * id), or null when there is none. The `[[id]]`/`[#id]` line is still also
 * surfaced as an `anchor` symbol by the anchor pass below — both name the same
 * id, and rename/find-references key off the anchor kind (US12).
 */
function explicitSectionId(content: string, headingStart: number): string | null {
  if (headingStart === 0 || content[headingStart - 1] !== '\n') return null;
  const previousLineStart = content.lastIndexOf('\n', headingStart - 2) + 1;
  const match = SECTION_ID_ATTR_RE.exec(content.slice(previousLineStart, headingStart - 1));
  return match ? (match[1] ?? match[2]) : null;
}

/** Extract all definable symbols (sections/anchors/attributes) from a file's content. */
export function extractSymbols(fileId: string, content: string): ProjectSymbol[] {
  const symbols: ProjectSymbol[] = [];

  for (const match of content.matchAll(HEADING_RE)) {
    const explicitId = explicitSectionId(content, match.index ?? 0);
    symbols.push({ kind: 'section', name: explicitId ?? headingToId(match[2]), fileId, range: rangeOf(match) });
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

/**
 * Extract attribute name→value definitions (`:name: value`) from a file, in
 * document order, with names downcased (Asciidoctor treats them case-insensitively).
 * Unset definitions (`:name!:`) are skipped. Used to resolve `{attr}` references in
 * include/image targets; later definitions override earlier ones when merged.
 *
 * @param content - The file's full text.
 * @returns The ordered list of attribute definitions.
 */
export function extractAttributeDefinitions(content: string): Array<{ name: string; value: string }> {
  const definitions: Array<{ name: string; value: string }> = [];
  for (const match of content.matchAll(ATTR_DEF_VALUE_RE)) {
    definitions.push({ name: match[1].toLowerCase(), value: match[2] });
  }
  return definitions;
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
  // Attribute values accumulate as the walk descends so a child include can use an
  // attribute the parent defined (document-order, last definition wins).
  const attributes = new Map<string, string>();

  const walk = (fileId: string): void => {
    if (visited.has(fileId)) return;
    visited.add(fileId);
    nodes.push(fileId);

    const content = readContent(fileId);
    if (content === null) return;

    for (const definition of extractAttributeDefinitions(content)) attributes.set(definition.name, definition.value);

    for (const match of content.matchAll(INCLUDE_RE)) {
      const rawTarget = match[1].trim();
      const range = rangeOf(match);
      const resolved = resolveInclude(fileId, substitutePathAttributes(rawTarget, attributes));
      if (resolved === null) {
        unresolved.push({ fromFile: fileId, target: rawTarget, range });
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
