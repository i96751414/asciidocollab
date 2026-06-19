import type {
  DocumentOrderEvent,
  DocumentTree,
  IncludeEdge,
  ProjectSymbol,
  Reference,
  ResolvedAttributeScope,
  UnresolvedInclude,
} from '../types/asciidoc';
// Conditional-region gating + `{ref}` substitution come from the shared zero-dependency authority so
// the server and the in-browser editor gate includes/content identically (no hand-kept mirror).
import {
  ConditionalRegionStack,
  conditionalLineKind,
  substitutePathAttributes,
} from '@asciidocollab/asciidoc-core';

// Re-exported so existing domain consumers (the services barrel) keep importing them from here.
export { parseConditional, evaluateConditional } from '@asciidocollab/asciidoc-core';

/**
 * Pure reference/symbol extraction + include-graph and effective-level rules for
 * AsciiDoc — no CodeMirror, no Prisma. Consumed by the web symbol-index
 * projection and the domain `FindReferencesUseCase` / move-rename use cases.
 */

const XREF_RE = /<<([^,>\n]+)(?:,[^>\n]*)?>>|xref:([^[\n]+)\[/g;
// An include directive must occupy the WHOLE line (trailing whitespace only) to be processed by
// Asciidoctor — `include::x[] trailing` is a paragraph, not a directive. End-anchored so the symbol
// index, reference extraction, and offset/inheritance walks all agree with the preview assembler.
const INCLUDE_RE = /^[ \t]*include::([^[\n]+)\[([^\]\n]*)\][ \t]*$/gm;
const IMAGE_RE = /image::?([^[\n]+)\[/g;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z][\w:.-]*)\[/g;
const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):/gm;
// Attribute definition WITH its value: `:name: value` (an unset `:name!:` does not match).
const ATTR_DEF_VALUE_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*(.*?)[ \t]*$/gm;
// A single attribute-entry LINE (anchored, not global): a set `:name: value`, a prefix unset
// `:!name:`, or a suffix unset `:name!:`. Group 1/3 = name (set / suffix-unset), group 2 = value,
// group 4 = prefix-unset name. Used by the line-scanning event builder so wrapping continuation
// (a trailing `\`) and unset can be handled, which the global value regex cannot express.
const ATTR_ENTRY_LINE_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*(.*)$|^:!([A-Za-z0-9][\w-]*):[ \t]*$|^:([A-Za-z0-9][\w-]*)!:[ \t]*$/;
// Inline attribute assignment in body text: `{set:name:value}` (set) or `{set:name!}` (unset).
const INLINE_SET_RE = /\{set:([A-Za-z0-9][\w-]*)(?:!|:([^}]*))\}/g;
// A soft-set precedence marker: a value ending in `@` is an overridable default (Asciidoctor
// soft-set), so it must NOT clobber an attribute already in scope. The marker is stripped.
const SOFT_SET_SUFFIX = '@';
// A trailing `\` (after optional whitespace) continues an attribute value on the next line.
const VALUE_CONTINUATION_RE = /\\[ \t]*$/;
// Partial-include selectors in an include directive's attribute list: `tags=`/`tag=` and `lines=`.
// The value may be quoted; tokens are separated by `;` or `,`.
const INCLUDE_TAGS_RE = /\btags?\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\]]+))/;
const INCLUDE_LINES_RE = /\blines\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\]]+))/;
const SELECTOR_SEPARATOR_RE = /[;,]/;
const HEADING_RE = /^(={1,6})\s+(.+)$/gm;
// An explicit block id (`[#id]` or `[[id]]`) on its own line. When it sits
// immediately above a heading it overrides the auto-generated section id.
const SECTION_ID_ATTR_RE = /^[ \t]*\[(?:#([A-Za-z][\w:.-]*)|\[([A-Za-z][\w:.-]*)\])\][ \t]*$/;

// A `==`-line is only a section title at a block boundary. Plain prose opens a paragraph that
// absorbs every following non-blank line until a blank line, so `prose\n== Foo` is paragraph
// text, not a heading. A blank line, a closing delimited block, or a single-line block construct
// (attribute entry / block-attribute / block title / comment / block macro) keeps the next line
// at a boundary. NON-AUTHORITATIVE MIRROR of the editor rule in
// `apps/web/src/lib/codemirror/asciidoc-effective-levels.ts` (`computeHeadingLevels` /
// `isBoundaryBlockConstruct`); keep them in sync. Verified against Asciidoctor + the Lezer grammar.
const DELIMITER_LINE_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,}|={4,}|\*{4,}|_{4,}|--|\|===|,===|:===)$/;
const BOUNDARY_CONSTRUCT_RE = /^(?::[A-Za-z0-9][\w-]*!?:|\[.+\]$|\.[^\s.[]|\/\/|[A-Za-z0-9_-]+::\S)/;

/**
 * Offsets (line starts) of the `={1,6} text` lines that are genuine section titles, meaning those
 * that sit at a block boundary rather than being absorbed into a paragraph. Used to filter the raw
 * {@link HEADING_RE} matches in {@link extractSymbols} so prose like `text\n== Foo` is not
 * mistaken for a section.
 */
function realHeadingOffsets(content: string): Set<number> {
  const offsets = new Set<number>();
  let cursor = 0;
  let openDelimiter: string | null = null;
  let inParagraph = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const start = cursor;
    cursor += line.length + 1;
    if (openDelimiter !== null) {
      if (trimmed === openDelimiter) openDelimiter = null;
      continue;
    }
    if (trimmed === '') {
      inParagraph = false;
      continue;
    }
    if (inParagraph) continue; // absorbed paragraph continuation — starts no block
    if (DELIMITER_LINE_RE.test(trimmed)) {
      openDelimiter = trimmed;
      continue;
    }
    if (/^={1,6}\s+\S/.test(line)) {
      offsets.add(start);
      continue;
    }
    if (!BOUNDARY_CONSTRUCT_RE.test(trimmed)) inParagraph = true;
  }
  return offsets;
}

// Verbatim/comment delimited-block fences whose bodies are NOT subject to xref/attribute/macro
// substitution: listing (`----`), literal (`....`), passthrough (`++++`), and comment (`////`).
// Example/sidebar/quote/open blocks DO substitute, so they are deliberately excluded here. The
// fence must begin at column 0 (only trailing whitespace allowed) — Asciidoctor does not treat an
// INDENTED run as a delimiter, so matching a trimmed line would mask real references after stray
// indented content. Capture group 1 is the delimiter token (length-sensitive close matching).
const VERBATIM_FENCE_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,})[ \t]*$/;

/**
 * Character ranges of the document that are verbatim or comment regions — delimited listing/
 * literal/passthrough/comment blocks (their fences included) plus `//` line comments. Tokens
 * inside these are literal text, not real references/anchors, so extraction skips matches that
 * start within them (so find-references / rename never touch code samples). An unterminated block
 * extends to end of document, mirroring Asciidoctor. NON-AUTHORITATIVE MIRROR of the editor copy
 * in `apps/web/src/lib/asciidoc/extraction.ts` (`verbatimRanges`); keep them in sync.
 */
function verbatimRanges(content: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  let open: { delimiter: string; from: number } | null = null;
  for (const line of content.split('\n')) {
    const start = cursor;
    const lineEnd = cursor + line.length;
    cursor += line.length + 1; // account for the consumed newline
    // Match the RAW line (not trimmed): fences and `//` comments are only recognized at column 0.
    const fence = VERBATIM_FENCE_RE.exec(line);
    if (open !== null) {
      if (fence && fence[1] === open.delimiter) {
        ranges.push({ from: open.from, to: lineEnd });
        open = null;
      }
      continue;
    }
    if (fence) {
      open = { delimiter: fence[1], from: start };
      continue;
    }
    if (line.startsWith('//')) ranges.push({ from: start, to: lineEnd });
  }
  if (open !== null) ranges.push({ from: open.from, to: content.length });
  return ranges;
}

/** Whether `pos` falls inside any of the (ascending, non-overlapping) verbatim ranges. */
function isInRanges(pos: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((range) => pos >= range.from && pos < range.to);
}

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

// An attribute-form `:leveloffset:` entry: a relative `+N`/`-N` shift, an absolute `N` set, or an
// unset (`:leveloffset!:` / empty value) that returns to the base. Group 1 = `!` suffix, group 2 =
// the (trimmed) value. NON-AUTHORITATIVE MIRROR of the editor parser in
// `apps/web/src/lib/codemirror/asciidoc-effective-levels.ts`; the model keeps its own copy so the
// resolution layer does not depend on the CodeMirror layer.
/**
 * Apply a `:leveloffset:` attribute VALUE (the document-order event value) to a running offset.
 * `base` is the value an unset (`null`) or empty entry returns to (the offset inherited at the
 * enclosing include point); a relative `+N`/`-N` shifts `current`; an absolute `N` replaces it. The
 * offset walk consumes the same document-order attribute events as the inheritance walk (rather than
 * re-scanning lines), so the two cannot diverge.
 */
function applyLevelOffsetValue(value: string | null, current: number, base: number): number {
  if (value === null || value === '') return base;
  if (value.startsWith('+') || value.startsWith('-')) {
    const delta = Number.parseInt(value, 10);
    return Number.isNaN(delta) ? base : current + delta;
  }
  const absolute = Number.parseInt(value, 10);
  return Number.isNaN(absolute) ? base : absolute;
}

/** Extract all references (xref/include/image/attributeRef) from a file's content. */
export function extractReferences(fileId: string, content: string): Reference[] {
  const references: Reference[] = [];
  const verbatim = verbatimRanges(content);
  const skip = (match: RegExpMatchArray) => isInRanges(match.index ?? 0, verbatim);

  for (const match of content.matchAll(XREF_RE)) {
    if (skip(match)) continue;
    const target = (match[1] ?? match[2] ?? '').trim();
    if (target) references.push({ kind: 'xref', target, fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(INCLUDE_RE)) {
    if (skip(match)) continue;
    references.push({ kind: 'include', target: match[1].trim(), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(IMAGE_RE)) {
    if (skip(match)) continue;
    references.push({ kind: 'image', target: match[1].trim(), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ATTR_REF_RE)) {
    if (skip(match)) continue;
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

  const verbatim = verbatimRanges(content);
  const skip = (match: RegExpMatchArray) => isInRanges(match.index ?? 0, verbatim);

  const headingOffsets = realHeadingOffsets(content);
  for (const match of content.matchAll(HEADING_RE)) {
    if (!headingOffsets.has(match.index ?? 0)) continue; // absorbed into a paragraph — not a section
    const explicitId = explicitSectionId(content, match.index ?? 0);
    symbols.push({ kind: 'section', name: explicitId ?? headingToId(match[2]), fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ANCHOR_RE)) {
    if (skip(match)) continue;
    const name = match[1] ?? match[2] ?? match[3];
    if (name) symbols.push({ kind: 'anchor', name, fileId, range: rangeOf(match) });
  }
  for (const match of content.matchAll(ATTR_DEF_RE)) {
    if (skip(match)) continue;
    if (match[2] !== '!') symbols.push({ kind: 'attribute', name: match[1], fileId, range: rangeOf(match) });
  }
  // Inline `{set:name:value}` assignments define an attribute exactly like a `:name:` entry, so they
  // surface as `attribute` symbols too (FR-040) — otherwise a `{set:}`-defined name would not be
  // recognized as known and `{name}` would resolve as unresolved. An inline unset (`{set:name!}`)
  // defines nothing, so it is skipped (group 2 undefined). A `{set:}` that is itself the VALUE TEXT of
  // a `:name: value` entry is not a real assignment (Asciidoctor only runs it if `{name}` is rendered),
  // so attribute-entry value spans are skipped too — otherwise a phantom symbol leaks (#4).
  const attributeValueSpans = attributeEntryValueRanges(content, verbatim);
  for (const match of content.matchAll(INLINE_SET_RE)) {
    if (skip(match) || isInRanges(match.index ?? 0, attributeValueSpans)) continue;
    if (match[2] !== undefined) symbols.push({ kind: 'attribute', name: match[1], fileId, range: rangeOf(match) });
  }
  return symbols;
}

/**
 * Extract attribute name→value definitions (`:name: value`) from a file, in
 * document order, with names downcased (Asciidoctor treats them case-insensitively).
 * Unset definitions (`:name!:`) are skipped. Used to resolve `{attr}` references in
 * include/image targets ({@link substitutePathAttributes}); later definitions
 * override earlier ones when merged into a map.
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

/**
 * The file's OWN net attribute scope (lowercase name → value) after applying every attribute event
 * in document order: `:name: value` entries, inline `{set:name:value}` assignments, prefix/suffix
 * unsets, soft-set defaults, and wrapped values — with nested `{ref}`s expanded against the values
 * defined so far (Asciidoctor's definition-time resolution).
 *
 * Unlike {@link extractAttributeDefinitions} (a `:name:`-only ordered list used for raw path
 * substitution), this is the authoritative own-file contribution for the symbol index's project-wide
 * `attributes` view and the own-part of `effectiveAttributes` — so a `{set:}`-defined attribute is
 * recognized in the editor exactly like a `:name:` entry (FR-040). It reuses the SAME document-order
 * model as the include-graph inheritance walk, keeping a file's own definitions consistent with what
 * its children inherit. No inherited seed applies here (own scope only).
 *
 * @param content - The file's full text.
 * @returns The file's own attribute map (lowercase name → value); empty when none.
 */
export function extractOwnAttributes(content: string): ReadonlyMap<string, string> {
  return applyOwnAttributes(content, new Map());
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
 * The attribute events (entry set/unset, inline `{set:}`, wrapped values) and include directives of
 * a file in document (offset) order, so the include walk can apply attributes and resolve includes
 * interleaved exactly as Asciidoctor does: an include — and any reference — sees only the attribute
 * state established ABOVE it, not what is defined later in the same file.
 *
 * Attribute entries are scanned line-by-line (not via the global value regex) so a wrapping value (a
 * trailing `\` continues onto the next line) is joined, a prefix/suffix unset (`:!name:` / `:name!:`)
 * becomes a `value: null` event, and a soft-set (`value@`) carries overridable-default precedence.
 * Inline `{set:name:value}` / `{set:name!}` assignments in body text become `inline-set` events at
 * their position. Include directives carry their matched directive for later expansion.
 */
/**
 * A {@link DocumentOrderEvent} extended with the conditional REGION boundaries the include-graph walk
 * needs to gate includes the same way the assembler/`effectiveLevelOffset` do. Internal to the walk;
 * `applyOwnAttributes` (which acts only on attribute/inline-set events) ignores them.
 */
type WalkEvent =
  | DocumentOrderEvent
  | { kind: 'region-open'; pos: number; line: string }
  | { kind: 'region-close'; pos: number };

/**
 * Character spans occupied by attribute-entry VALUES (`:name: value`, including any `\`-continuation
 * lines), excluding entries inside verbatim/comment blocks. A `{set:}`/`include::` that falls inside
 * such a span is value TEXT, not a document-order directive, so body scans skip it (#4/FR-041). The
 * caller passes the already-computed verbatim ranges to avoid re-scanning.
 */
function attributeEntryValueRanges(
  content: string,
  verbatim: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  const lines = content.split('\n');
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const start = cursor;
    cursor += lines[index].length + 1;
    if (isInRanges(start, verbatim)) continue;
    const match = ATTR_ENTRY_LINE_RE.exec(lines[index]);
    if (match === null || match[2] === undefined) continue; // not a SET entry (unset/no value)
    let raw = match[2];
    while (VALUE_CONTINUATION_RE.test(raw) && index + 1 < lines.length) {
      raw = raw.replace(VALUE_CONTINUATION_RE, '').trimEnd() + ' ' + lines[index + 1].trim();
      index += 1;
      cursor += lines[index].length + 1;
    }
    spans.push({ from: start, to: cursor });
  }
  return spans;
}

function documentOrderEvents(content: string): WalkEvent[] {
  const events: WalkEvent[] = [];

  // Verbatim/comment regions (listing/literal/passthrough/comment blocks + `//` lines): an
  // attribute-looking line, `{set:}`, `include::`, or conditional directive INSIDE one is literal
  // sample text, not a real directive. extractSymbols/extractReferences already skip these ranges;
  // the resolution model must agree so a code sample cannot pollute scope or synthesize includes.
  const verbatim = verbatimRanges(content);

  // Attribute ENTRIES, scanned per line so wrapping continuation and unset are expressible.
  // Character ranges consumed as `\`-continuation lines of a wrapped value: a directive-looking line
  // (an `include::` or `{set:}`) that is actually the continuation of an attribute value is value
  // TEXT, not a directive, so the body scans below must skip any match that starts inside one.
  const consumed: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const start = cursor;
    cursor += lines[index].length + 1;
    if (isInRanges(start, verbatim)) continue; // inside a verbatim/comment block — literal text
    // Conditional region boundaries are document-order events too, so include-gating sees them
    // interleaved with the attribute state. A single-line `ifdef::name[text]` content form is NOT a
    // region opener (handled by conditionalLineKind), so it never gates the lines below it.
    const condKind = conditionalLineKind(lines[index]);
    if (condKind === 'endif') {
      events.push({ kind: 'region-close', pos: start });
      continue;
    }
    if (condKind === 'opener') {
      events.push({ kind: 'region-open', pos: start, line: lines[index] });
      continue;
    }
    const match = ATTR_ENTRY_LINE_RE.exec(lines[index]);
    if (match === null) continue;
    const unsetName = match[3] ?? match[4];
    if (unsetName !== undefined) {
      events.push({ kind: 'attribute', pos: start, name: unsetName.toLowerCase(), value: null });
      continue;
    }
    // A set entry: join `\`-continued lines into a single value (FR-041). The ENTIRE entry span —
    // the first line's value AND any continuation lines — is value TEXT, so it is marked `consumed`:
    // a `{set:}`/`include::` appearing inside an attribute value is not a document-order directive and
    // must not be double-counted by the body scans below (#4).
    const entryStart = start;
    let raw = match[2];
    while (VALUE_CONTINUATION_RE.test(raw) && index + 1 < lines.length) {
      raw = raw.replace(VALUE_CONTINUATION_RE, '').trimEnd() + ' ' + lines[index + 1].trim();
      index += 1;
      cursor += lines[index].length + 1;
    }
    consumed.push({ from: entryStart, to: cursor });
    // The raw value (soft-set `@` marker still attached) is carried through; precedence is applied
    // in {@link applyAttributeEvent} (a `value@` is an overridable default; a plain entry is a normal
    // set).
    events.push({ kind: 'attribute', pos: start, name: match[1].toLowerCase(), value: raw.trimEnd() });
  }

  const inConsumedValue = (pos: number): boolean => consumed.some((range) => pos >= range.from && pos < range.to);
  const skip = (pos: number): boolean => inConsumedValue(pos) || isInRanges(pos, verbatim);

  // Inline `{set:}` assignments anywhere in the body (FR-040), excluding those inside a wrapped value
  // or a verbatim block.
  for (const match of content.matchAll(INLINE_SET_RE)) {
    if (skip(match.index ?? 0)) continue;
    const value = match[2] === undefined ? null : match[2];
    events.push({ kind: 'inline-set', pos: match.index ?? 0, name: match[1].toLowerCase(), value });
  }

  for (const match of content.matchAll(INCLUDE_RE)) {
    if (skip(match.index ?? 0)) continue;
    events.push({ kind: 'include', pos: match.index ?? 0, match });
  }
  return events.toSorted((a, b) => a.pos - b.pos);
}

/**
 * Apply one attribute event to the running accumulator in document reading order, honoring
 * precedence:
 *  - an unset removes the name (FR-005);
 *  - a soft-set (value ending in `@`) is an overridable default — it applies only when the name is
 *    not already in scope, so it cannot clobber an existing value (Asciidoctor soft-set precedence);
 *  - a plain entry / inline-set overrides any existing value.
 *
 * Nested `{ref}`s in a set value are expanded against the attributes-so-far at definition time,
 * matching Asciidoctor (existing behavior).
 */
function applyAttributeEvent(
  event: Extract<DocumentOrderEvent, { kind: 'attribute' | 'inline-set' }>,
  attributes: Map<string, string>,
): void {
  if (event.value === null) {
    attributes.delete(event.name);
    return;
  }
  const soft = event.value.endsWith(SOFT_SET_SUFFIX);
  if (soft && attributes.has(event.name)) return; // overridable default — do not clobber.
  const value = soft ? event.value.slice(0, -SOFT_SET_SUFFIX.length).trimEnd() : event.value;
  attributes.set(event.name, substitutePathAttributes(value, attributes));
}

/** The include graph plus, per file, the attributes it inherits from its ancestors. */
export interface IncludeGraphResult {
  /** The transitive include graph rooted at the start file. */
  tree: DocumentTree;
  /**
   * Maps a file id to the attributes (lowercase name → value) it inherits from its ancestor files
   * at the document-order point the file's `include::` directive is reached. Empty for the root and
   * for files reached through multiple paths (the first visit wins). A child therefore inherits
   * only the parent attributes defined ABOVE its include — including `:imagesdir:` and any
   * `{attr}` used in its own macro targets — and NOT those a parent defines after the include.
   */
  inheritedAttributes: Map<string, ReadonlyMap<string, string>>;
}

/**
 * Build the transitive include graph from a root file, recording the attributes each file inherits
 * from its ancestors. Cycle-guarded (a file is visited once), so a recursive include (file a
 * includes file b which includes file a) terminates instead of looping; each edge carries the
 * `leveloffset=` declared on its include.
 *
 * Attribute values accumulate in document order across the whole walk (set/unset/inline-set with
 * soft-set precedence via {@link applyAttributeEvent}); a child include is resolved against the
 * attributes known when its directive is reached, so a parent's header attributes are in scope but
 * attributes the parent defines after the include are not — matching Asciidoctor. `{attr}` references
 * in an include target are expanded the same way.
 *
 * @param rootFileId - The main/current file id.
 * @param readContent - Returns a file's content, or null if unavailable.
 * @param resolveInclude - Resolves an (already attribute-substituted) include target
 *   to a file id, or null.
 *   SECURITY (Constitution IX): include `target`s are user-controlled, so this callback
 *   MUST sandbox them via `resolveSandboxedPath` (the web symbol index does) — this pure
 *   model deliberately performs no filesystem access and cannot confine paths itself.
 * @param seedAttributes - Attribute state in effect at the root but not written in source (the render
 *   intrinsics, e.g. `backend-html5`). Seeds the conditional-GATING scope only — so an
 *   `ifdef::backend-html5[]include::…]` resolves active here exactly as the preview gates it — and is
 *   NOT folded into the returned inherited attribute values. Defaults to ∅.
 * @returns The {@link IncludeGraphResult}.
 */
export function buildIncludeGraphWithInheritance(
  rootFileId: string,
  readContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
  seedAttributes?: ReadonlyMap<string, string>,
): IncludeGraphResult {
  const nodes: string[] = [];
  const edges: IncludeEdge[] = [];
  const unresolved: UnresolvedInclude[] = [];
  const visited = new Set<string>();
  const inheritedAttributes = new Map<string, ReadonlyMap<string, string>>();
  // Attribute values accumulate as the walk descends so a child include can use an attribute the
  // parent defined (document order; soft-set/unset precedence via applyAttributeEvent).
  const attributes = new Map<string, string>();
  const hasSeed = seedAttributes !== undefined && seedAttributes.size > 0;
  // The scope used ONLY to evaluate conditional gating: the document-order attributes overlaid on the
  // gating seed (in-document entries win). Kept separate from `attributes` so render intrinsics never
  // leak into the inherited values the walk returns. Built lazily — gating directives are rare.
  const gatingScope = (): ReadonlyMap<string, string> =>
    hasSeed ? new Map([...seedAttributes, ...attributes]) : attributes;

  const walk = (fileId: string): void => {
    if (visited.has(fileId)) return;
    visited.add(fileId);
    nodes.push(fileId);
    // Snapshot what this file inherits from its ancestors, before its own definitions apply.
    inheritedAttributes.set(fileId, new Map(attributes));

    const content = readContent(fileId);
    if (content === null) return;

    // Apply attribute events and resolve includes interleaved in document order, so an include sees
    // only the attributes defined ABOVE it (a parent's header attributes are in scope for a child,
    // but attributes defined after the include are not — matching Asciidoctor). A per-file region stack
    // gates includes inside an inactive conditional branch (mirrors the assembler/effectiveLevelOffset).
    const regions = new ConditionalRegionStack();
    for (const event of documentOrderEvents(content)) {
      if (event.kind === 'region-open') {
        regions.open(event.line, gatingScope());
        continue;
      }
      if (event.kind === 'region-close') {
        regions.close();
        continue;
      }
      if (event.kind === 'attribute' || event.kind === 'inline-set') {
        applyAttributeEvent(event, attributes);
        continue;
      }
      // An include inside an inactive conditional branch is gated off: it is not part of the rendered
      // document, so it contributes no edge, node, or inherited scope.
      if (!regions.isActive()) continue;
      const match = event.match;
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
  return { tree: { rootFileId, nodes, edges, unresolved }, inheritedAttributes };
}

/**
 * Build the transitive include graph from a root file (see {@link buildIncludeGraphWithInheritance}
 * for the cycle-guard and attribute-scoping rules). Convenience wrapper for callers that only need
 * the graph and not the per-file inherited attributes.
 *
 * @param rootFileId - The main/current file id.
 * @param readContent - Returns a file's content, or null if unavailable.
 * @param resolveInclude - Resolves an include target (from a file) to a file id, or null.
 * @returns The transitive {@link DocumentTree}.
 */
export function buildIncludeGraph(
  rootFileId: string,
  readContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
): DocumentTree {
  return buildIncludeGraphWithInheritance(rootFileId, readContent, resolveInclude).tree;
}

/**
 * Apply a file's OWN attribute events (set/unset/inline-set, in document order) on top of a seeded
 * scope (its inherited context), honoring soft-set/unset precedence. Returns the resulting name →
 * value map.
 */
function applyOwnAttributes(content: string, seed: ReadonlyMap<string, string>): Map<string, string> {
  const attributes = new Map(seed);
  for (const event of documentOrderEvents(content)) {
    if (event.kind === 'attribute' || event.kind === 'inline-set') {
      applyAttributeEvent(event, attributes);
    }
  }
  return attributes;
}

/**
 * Resolve the effective attribute scope for a file given the project main file (`rootFileId`).
 *
 * - `rootFileId === null` ⇒ standalone scope (origin `standalone`): only the file's own attributes
 *   resolve, with no inherited context (FR-002b).
 * - `fileId === rootFileId` ⇒ root scope (origin `root`): the main file's own attributes.
 * - otherwise ⇒ inherited scope (origin `inherited`): the attributes the file inherits at its
 *   FIRST include point from the root (FR-002a), with the file's own definitions applied on top.
 *   A file unreachable from the root inherits nothing.
 *
 * Cycle/depth-safe via the existing include-graph guard (FR-007). Unset (`:!name:`), inline
 * `{set:}`, wrapping values, and soft-set precedence are all honored (FR-003/005/040/041).
 *
 * @param args.rootFileId - The configured main file, or `null` when none is set (standalone).
 * @param args.fileId - The file whose scope to resolve.
 * @param args.readContent - Returns a file's content, or null if unavailable.
 * @param args.resolveInclude - Resolves an include target (from a file) to a file id, or null
 *   (MUST sandbox user-controlled targets — see {@link buildIncludeGraphWithInheritance}).
 * @param args.seedAttributes - Attribute state in effect at the root but not written in source (the
 *   render intrinsics). Seeds the conditional-GATING scope only (not the returned values) so a file
 *   reachable only through an inactive branch inherits nothing, matching the preview. Defaults to ∅.
 * @returns The {@link ResolvedAttributeScope} (values as a ReadonlyMap).
 */
export function resolveAttributeScope(arguments_: {
  rootFileId: string | null;
  fileId: string;
  readContent: (fileId: string) => string | null;
  resolveInclude: (from: string, target: string) => string | null;
  seedAttributes?: ReadonlyMap<string, string>;
}): ResolvedAttributeScope {
  const { rootFileId, fileId, readContent, resolveInclude, seedAttributes } = arguments_;
  const content = readContent(fileId);

  // Standalone or the root file itself: only the file's own attributes, no inherited context.
  if (rootFileId === null || fileId === rootFileId) {
    const values = content === null ? new Map<string, string>() : applyOwnAttributes(content, new Map());
    return { fileId, values, origin: rootFileId === null ? 'standalone' : 'root' };
  }

  // Inherited: take the file's inherited context at its first include point from the root, then
  // apply the file's own definitions on top. The gating seed confines inheritance to active branches.
  const { inheritedAttributes } = buildIncludeGraphWithInheritance(rootFileId, readContent, resolveInclude, seedAttributes);
  const seed = inheritedAttributes.get(fileId) ?? new Map<string, string>();
  const values = content === null ? new Map(seed) : applyOwnAttributes(content, seed);
  return { fileId, values, origin: 'inherited' };
}

/**
 * Parse the tag filter from an include directive's attribute list (`tags=`/`tag=`). Tokens are
 * separated by `;` or `,`, may be quoted, and support negation (`!tag`) and the `*`/`**` wildcards
 * (FR-033). Returns the ordered token list, or `null` when no tag selector is present (no filter).
 */
export function parseIncludeTags(attributes: string): string[] | null {
  const match = INCLUDE_TAGS_RE.exec(attributes);
  if (match === null) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? '';
  return raw
    .split(SELECTOR_SEPARATOR_RE)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Parse the line filter from an include directive's attribute list (`lines=`). Supports a single
 * line (`2` ⇒ `[2, 2]`), a closed range (`2..4` ⇒ `[2, 4]`), multiple ranges (`1;3..4` or `1,3..4`),
 * and an open-ended range (`5..-1` or `5..` ⇒ `[5, null]`) (FR-034). Returns the ordered ranges, or
 * `null` when no line selector is present (no filter).
 */
export function parseIncludeLines(attributes: string): Array<[number, number | null]> | null {
  const match = INCLUDE_LINES_RE.exec(attributes);
  if (match === null) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? '';
  const ranges: Array<[number, number | null]> = [];
  for (const token of raw.split(SELECTOR_SEPARATOR_RE)) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    const dots = trimmed.indexOf('..');
    if (dots === -1) {
      const single = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(single)) ranges.push([single, single]);
      continue;
    }
    const start = Number.parseInt(trimmed.slice(0, dots), 10);
    if (Number.isNaN(start)) continue;
    const endRaw = trimmed.slice(dots + 2).trim();
    const end = Number.parseInt(endRaw, 10);
    // An open-ended range (`5..`, `5..-1`, or any negative end) reaches the end of file ⇒ null.
    ranges.push([start, endRaw === '' || Number.isNaN(end) || end < 0 ? null : end]);
  }
  return ranges;
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

/**
 * The effective level offset in scope for a file at its FIRST include point from the project main
 * file (`rootFileId`) — the value the editor's structural understanding and the assembled preview
 * must apply to that file's raw heading levels (FR-008/FR-009/FR-010).
 *
 * Unlike {@link inheritedLevelOffset} (which sums only the `leveloffset=` include OPTIONS along the
 * path), this also folds in the attribute-form `:leveloffset:` entries a parent declares ABOVE the
 * include, in document order. Each include is INCLUDE-SCOPED: a `:leveloffset:` an ancestor changes
 * inside one include — even unbalanced — is restored to the value in effect before that include when
 * it ends, so the change cannot leak into a sibling include or back into the parent. The walk reuses
 * the include-graph cycle guard and first-visit-wins semantics (FR-007).
 *
 * - `rootFileId === null` (standalone) or `fileId === rootFileId` (the root) ⇒ 0 (no inherited offset).
 * - A file unreachable from the root ⇒ 0.
 *
 * An include wrapped by a conditional (`ifdef`/`ifndef`/`ifeval`) region that is INACTIVE for the
 * document-order attribute state is NOT walked — it is gated off exactly as the preview assembler
 * gates it, so a child reachable only through an inactive branch inherits no offset. `seedAttributes`
 * supplies the attribute state already in effect at the root that is not written as `:name:` lines
 * (the render intrinsics the assembler seeds), so an `ifdef::backend-html5[]include::…]` resolves
 * active here just as it does in the render.
 *
 * @param args.rootFileId - The configured main file, or `null` when none is set (standalone).
 * @param args.fileId - The file whose inherited effective offset to resolve.
 * @param args.readContent - Returns a file's content, or null if unavailable.
 * @param args.resolveInclude - Resolves an include target (from a file) to a file id, or null
 *   (MUST sandbox user-controlled targets — see {@link buildIncludeGraphWithInheritance}).
 * @param args.seedAttributes - Attribute state in effect at the root but not written in source (render
 *   intrinsics); seeds the conditional-gating scope so it agrees with the preview. Defaults to ∅.
 * @returns The effective offset (an integer) in scope at the file's first include point.
 */
export function effectiveLevelOffset(arguments_: {
  rootFileId: string | null;
  fileId: string;
  readContent: (fileId: string) => string | null;
  resolveInclude: (from: string, target: string) => string | null;
  seedAttributes?: ReadonlyMap<string, string>;
}): number {
  const { rootFileId, fileId, readContent, resolveInclude, seedAttributes } = arguments_;
  if (rootFileId === null || fileId === rootFileId) return 0;

  const visited = new Set<string>();
  const captured = new Map<string, number>();
  // Document-order attribute state, seeded with the render intrinsics, mutated as the walk descends
  // (a parent's definitions are in scope for its includes) so conditional gating matches the assembler.
  const attributes = new Map<string, string>(seedAttributes);

  // Walk the include tree in document order tracking the running offset. `base` is the offset in
  // effect when this file's content began (the enclosing include's offset) — an unset returns to it.
  const walk = (currentFileId: string, base: number): void => {
    if (visited.has(currentFileId)) return;
    visited.add(currentFileId);
    captured.set(currentFileId, base); // the offset inherited at this file's first include point

    const content = readContent(currentFileId);
    if (content === null) return;

    let offset = base;
    // Per-file region stack (the shared gating authority): an include is walked only when EVERY
    // enclosing region is active (mirrors the assembler), and an empty/unparseable opener still
    // balances its `endif`. File-local so an unbalanced if/endif in one file cannot gate another. The
    // offset walk consumes the SAME `documentOrderEvents` stream as {@link buildIncludeGraphWithInheritance},
    // so gating, `\`-continuation joining (FR-041, #3), and verbatim skipping cannot diverge.
    const conditionals = new ConditionalRegionStack();
    for (const event of documentOrderEvents(content)) {
      if (event.kind === 'region-open') {
        conditionals.open(event.line, attributes);
        continue;
      }
      if (event.kind === 'region-close') {
        conditionals.close();
        continue;
      }
      if (event.kind === 'attribute' || event.kind === 'inline-set') {
        // Track attribute effects (`:name:` / `{set:}`) so conditional gating reflects what precedes
        // each include; the attribute-form `:leveloffset:` also shifts the running offset in document
        // order (an unset returns to `base`).
        applyAttributeEvent(event, attributes);
        if (event.kind === 'attribute' && event.name === 'leveloffset') {
          offset = applyLevelOffsetValue(event.value, offset, base);
        }
        continue;
      }
      // An include inside an inactive branch is gated off (never expanded in the preview), so it is
      // not walked and contributes no inherited offset.
      if (!conditionals.isActive()) continue;
      const resolved = resolveInclude(currentFileId, event.match[1].trim());
      if (resolved === null) continue;
      // The include option is a relative shift on top of the offset in effect here; the child is
      // walked with that as its base. Whatever the child does to the offset is discarded on return
      // (include-scoped restoration), so `offset` for the rest of this file is unchanged.
      walk(resolved, offset + parseIncludeLevelOffset(event.match[2]));
    }
  };

  walk(rootFileId, 0);
  return captured.get(fileId) ?? 0;
}

function rangeOf(match: RegExpMatchArray): { from: number; to: number } {
  const from = match.index ?? 0;
  return { from, to: from + match[0].length };
}
