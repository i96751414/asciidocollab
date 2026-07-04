/**
 * Reference and symbol extraction: `extractReferences` finds every xref/include/image/`{attr}` use,
 * `extractSymbols` finds every definable symbol (sections, anchors, attributes), and `resolveReference`
 * matches a reference to a known symbol. Section ids are derived through the SAME line-aware
 * document-order attribute state as scope resolution (so `idprefix`/`idseparator`/`sectids` and
 * explicit `[[id]]` overrides are honoured per heading), and headings come from the single
 * `realHeadingOffsets` authority. The single copy shared by the server (@asciidocollab/domain) and the editor (apps/web).
 */
import type { DocumentOrderEvent, ProjectSymbol, Reference } from '../types';
import { XREF_RE, INCLUDE_RE, IMAGE_RE, ATTR_REF_RE, ANCHOR_RE, ATTR_DEF_RE, INLINE_SET_RE, HEADING_RE, SECTION_ID_ATTR_RE } from './grammar';
import { verbatimRanges, isInRanges, rangeOf } from './text-ranges';
import { realHeadingOffsets, headingToId, DEFAULT_ID_PREFIX, DEFAULT_ID_SEPARATOR } from './headings';
import { documentOrderEvents, applyAttributeEvent, attributeEntryValueRanges } from './document-order';

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
 * id, and rename/find-references key off the anchor kind.
 */
function explicitSectionId(content: string, headingStart: number): string | null {
  if (headingStart === 0 || content[headingStart - 1] !== '\n') return null;
  const previousLineStart = content.lastIndexOf('\n', headingStart - 2) + 1;
  const match = SECTION_ID_ATTR_RE.exec(content.slice(previousLineStart, headingStart - 1));
  return match ? (match[1] ?? match[2]) : null;
}

/**
 * Extract all definable symbols (sections/anchors/attributes) from a file's content.
 *
 * @param fileId - The file the symbols belong to.
 * @param content - The file's full text.
 * @param seed - The attributes this file inherits from including documents at its include point
 *   (from the include-graph inheritance walk), used to resolve id-generation attributes
 *   (`idprefix`/`idseparator`/`sectids`) a parent set above the include. Omit for a standalone file.
 */
export function extractSymbols(fileId: string, content: string, seed?: ReadonlyMap<string, string>): ProjectSymbol[] {
  const symbols: ProjectSymbol[] = [];
  const verbatim = verbatimRanges(content);
  const skip = (match: RegExpMatchArray) => isInRanges(match.index ?? 0, verbatim);

  // A heading's auto-generated id depends on `idprefix`/`idseparator`/`sectids` — ordinary attributes,
  // so they are resolved LINE-AWARE from the SAME document-order event stream the include-graph
  // inheritance walk uses (never a separate whole-file regex scan). `idAttributes` starts from what
  // this file inherits, then each heading folds in the attribute events defined strictly above it.
  const idAttributes = new Map<string, string>(seed);
  // Asciidoctor generates section ids by default: model that as a present `sectids` key so a later
  // `:sectids!:` (an unset event, which DELETES the key) disables id generation from that line down.
  // An inherited `sectids` unset cannot be represented in the seed map (unset deletes the key), so a
  // parent's `:sectids!:` above the include does not propagate here — the file's own entries do.
  if (!idAttributes.has('sectids')) idAttributes.set('sectids', '');
  const idAttributeEvents = documentOrderEvents(content).filter(
    (event): event is Extract<DocumentOrderEvent, { kind: 'attribute' | 'inline-set' }> =>
      event.kind === 'attribute' || event.kind === 'inline-set',
  );
  let nextIdEvent = 0;
  const headingOffsets = realHeadingOffsets(content);
  for (const match of content.matchAll(HEADING_RE)) {
    const start = match.index ?? 0;
    if (!headingOffsets.has(start)) continue; // absorbed into a paragraph / in a block — not a section
    // Fold in every attribute event defined ABOVE this heading line so its id reflects only the
    // id-generation state established above it (later-defined entries do not affect earlier headings).
    while (nextIdEvent < idAttributeEvents.length && idAttributeEvents[nextIdEvent].pos < start) {
      applyAttributeEvent(idAttributeEvents[nextIdEvent], idAttributes);
      nextIdEvent += 1;
    }
    const explicitId = explicitSectionId(content, start);
    // An explicit `[[id]]`/`[#id]` id names the section regardless of `sectids`. Otherwise an auto id
    // is generated only when `sectids` is on — `:sectids!:` suppresses it, so there is no id to
    // reference and no `section` symbol is emitted (matching Asciidoctor).
    if (explicitId !== null) {
      symbols.push({ kind: 'section', name: explicitId, fileId, range: rangeOf(match) });
    } else if (idAttributes.has('sectids')) {
      const idprefix = idAttributes.get('idprefix') ?? DEFAULT_ID_PREFIX;
      const idseparator = idAttributes.get('idseparator') ?? DEFAULT_ID_SEPARATOR;
      symbols.push({ kind: 'section', name: headingToId(match[2], { idprefix, idseparator }), fileId, range: rangeOf(match) });
    }
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
  // surface as `attribute` symbols too — otherwise a `{set:}`-defined name would not be
  // recognized as known and `{name}` would resolve as unresolved. An inline unset (`{set:name!}`)
  // defines nothing, so it is skipped (group 2 undefined). A `{set:}` that is itself the VALUE TEXT of
  // a `:name: value` entry is not a real assignment (Asciidoctor only runs it if `{name}` is rendered),
  // so attribute-entry value spans are skipped too — otherwise a phantom symbol leaks.
  const attributeValueSpans = attributeEntryValueRanges(content, verbatim);
  for (const match of content.matchAll(INLINE_SET_RE)) {
    if (skip(match) || isInRanges(match.index ?? 0, attributeValueSpans)) continue;
    if (match[2] !== undefined) symbols.push({ kind: 'attribute', name: match[1], fileId, range: rangeOf(match) });
  }
  return symbols;
}

/**
 * The definition symbols in a file for a rename/find family, collapsing the section/anchor
 * namespace overlap. Anchors and attributes are definitions of their own kind; a heading's
 * AUTO-generated section id is ALSO an anchor-family definition (it shares the xref/anchor
 * namespace), but a section whose id is already declared by an explicit `[[id]]`/`[#id]` anchor is
 * dropped — that anchor is the canonical declaration, so counting both would double-report one
 * logical id. This is the single authority for "what defines this name" so find-usages and rename
 * (and their collision guards) agree instead of each open-coding the rule.
 *
 * @param symbols - The file's extracted symbols (from {@link extractSymbols}).
 * @param family - Restrict to the id/anchor family (`section`+`anchor`) or the attribute family;
 *   omit for both.
 * @returns The definition symbols, section-under-explicit-anchor duplicates removed.
 */
export function definitionSymbols(symbols: ProjectSymbol[], family?: 'anchor' | 'attribute'): ProjectSymbol[] {
  const wantAnchor = family === undefined || family === 'anchor';
  const wantAttribute = family === undefined || family === 'attribute';
  const explicitAnchorNames = new Set(symbols.filter((symbol) => symbol.kind === 'anchor').map((symbol) => symbol.name));
  return symbols.filter((symbol) => {
    if (symbol.kind === 'attribute') return wantAttribute;
    if (symbol.kind === 'anchor') return wantAnchor;
    // A section id is an anchor-family definition unless an explicit anchor already declares it.
    return wantAnchor && !explicitAnchorNames.has(symbol.name);
  });
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
