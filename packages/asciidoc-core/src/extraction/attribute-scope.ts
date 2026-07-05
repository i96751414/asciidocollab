/**
 * High-level attribute queries built on the document-order engine and the include graph — the public
 * answers to "what attributes are in scope for this file/line" and "what does this `{ref}` resolve to".
 * Everything here is LINE-AWARE and inheritance-aware: a query at a point sees only attributes defined
 * above it plus those inherited from including documents. This is the single place callers reach for
 * attribute scope; they never re-scan `:name:` lines themselves. The single copy shared by the server
 * (`@asciidocollab/domain`) and the editor (`apps/web`).
 */
import type { DocumentOrderEvent, ResolvedAttributeScope } from '../types';
import { ATTR_REF_RE, ATTR_DEF_VALUE_RE } from './grammar';
import { verbatimRanges, isInRanges } from './text-ranges';
import { documentOrderEvents, applyAttributeEvent, applyOwnAttributes, attributeEntryValueRanges, stripReservedAttributes, RESERVED_LEVELOFFSET } from './document-order';
import { buildIncludeGraphWithInheritance } from './include-graph';

/** Options shared by the project-aware resolvers that walk the include graph from a root file. */
interface ProjectScopeArguments {
  // The configured main file, or `null` when none is set (standalone).
  rootFileId: string | null;
  // The file whose scope to resolve.
  fileId: string;
  // Returns a file's content, or null if unavailable.
  readContent: (fileId: string) => string | null;
  // Resolves an include target (from a file) to a file id, or null (MUST sandbox user targets).
  resolveInclude: (from: string, target: string) => string | null;
  // Attribute state in effect at the root but not written in source (render intrinsics). Default ∅.
  seedAttributes?: ReadonlyMap<string, string>;
}

/**
 * The attributes a file inherits at its FIRST include point from the root — the seed its own
 * definitions apply on top of. Empty for a standalone document or the root file itself (neither
 * inherits anything). Confined to active conditional branches via the include-graph gating seed.
 */
function inheritedAttributeSeed(arguments_: ProjectScopeArguments): ReadonlyMap<string, string> {
  const { rootFileId, fileId, readContent, resolveInclude, seedAttributes } = arguments_;
  if (rootFileId === null || fileId === rootFileId) return new Map();
  const { inheritedAttributes } = buildIncludeGraphWithInheritance(rootFileId, readContent, resolveInclude, seedAttributes);
  return inheritedAttributes.get(fileId) ?? new Map();
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
    // ATTR_DEF_VALUE_RE captures the raw line tail; trim surrounding spaces/tabs (only — a trailing
    // `\r` from CRLF files is intentionally kept). Done with an index walk rather than
    // `/^[ \t]+/`/`/[ \t]+$/` replaces: the trailing anchored trim is quadratic on all-whitespace
    // input (ReDoS), whereas this is linear and behaviour-identical (a final `\r` blocks the
    // trailing walk, so spaces before it and the `\r` are preserved, exactly as `$` did).
    const raw = match[2];
    let start = 0;
    let end = raw.length;
    while (start < end && (raw[start] === ' ' || raw[start] === '\t')) start++;
    while (end > start && (raw[end - 1] === ' ' || raw[end - 1] === '\t')) end--;
    definitions.push({ name: match[1].toLowerCase(), value: raw.slice(start, end) });
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
 * recognized in the editor exactly like a `:name:` entry. It reuses the SAME document-order
 * model as the include-graph inheritance walk, keeping a file's own definitions consistent with what
 * its children inherit. No inherited seed applies here (own scope only).
 *
 * @param content - The file's full text.
 * @returns The file's own attribute map (lowercase name → value); empty when none.
 */
export function extractOwnAttributes(content: string): ReadonlyMap<string, string> {
  return stripReservedAttributes(applyOwnAttributes(content, new Map()));
}

/** A `{name}` attribute reference resolved to its value, with the reference's character range. */
export interface ResolvedAttributeReference {
  /** Document offset of the `{`. */
  from: number;
  /** Document offset just past the `}`. */
  to: number;
  /** The value the reference resolves to, in scope at the reference's position. */
  value: string;
}

/**
 * Resolve every `{name}` attribute reference in a file to the value in scope AT that reference's
 * position, using the SAME document-order attribute machinery as scope/inheritance resolution
 * ({@link documentOrderEvents} + {@link applyAttributeEvent}) — never a parallel regex scan of
 * `:name:` lines. Definitions apply LINE-AWARE: a reference sees only attributes set above it, plus
 * the inherited `seed`. References inside verbatim/comment blocks, and inside an attribute entry's own
 * value span (there the `{ref}` is expanded into the stored value, not folded standalone), are not
 * resolved. Inline `{set:}` / unset / soft-set precedence and `\`-wrapped values are all honored, and
 * a `{set:}` to the LEFT of a reference on the same line defines it in time (column order). Forward or
 * unknown references are omitted. Attribute names are case-insensitive.
 *
 * @param content - The file's full text.
 * @param seed - Attributes inherited from including documents (name → value); case-insensitive keys.
 * @returns The resolved references in document order.
 */
export function resolveAttributeReferences(
  content: string,
  seed: ReadonlyMap<string, string> = new Map(),
): ResolvedAttributeReference[] {
  const attributes = new Map<string, string>();
  for (const [name, value] of seed) attributes.set(name.toLowerCase(), value);

  const verbatim = verbatimRanges(content);
  const valueSpans = attributeEntryValueRanges(content, verbatim);
  const attributeEvents = documentOrderEvents(content).filter(
    (event): event is Extract<DocumentOrderEvent, { kind: 'attribute' | 'inline-set' }> =>
      event.kind === 'attribute' || event.kind === 'inline-set',
  );

  // Reference tokens, excluding those in verbatim/comment blocks or inside an attribute entry's own
  // value span (a `{ref}` there is substituted into the stored value by applyAttributeEvent).
  const references: Array<{ pos: number; length: number; name: string }> = [];
  for (const match of content.matchAll(ATTR_REF_RE)) {
    const pos = match.index ?? 0;
    if (isInRanges(pos, verbatim) || isInRanges(pos, valueSpans)) continue;
    references.push({ pos, length: match[0].length, name: match[1].toLowerCase() });
  }

  // Walk references in document order, folding in every definition event at or before each reference
  // so it resolves against exactly the attribute state established above it.
  const resolved: ResolvedAttributeReference[] = [];
  let nextEvent = 0;
  for (const reference of references) {
    while (nextEvent < attributeEvents.length && attributeEvents[nextEvent].pos <= reference.pos) {
      applyAttributeEvent(attributeEvents[nextEvent], attributes);
      nextEvent += 1;
    }
    // `leveloffset` is retained in the map for gating but its raw string is not a resolvable value —
    // do not resolve `{leveloffset}` to it (the real offset is owned by level-offset.ts).
    if (reference.name === RESERVED_LEVELOFFSET) continue;
    const value = attributes.get(reference.name);
    if (value === undefined) continue;
    resolved.push({ from: reference.pos, to: reference.pos + reference.length, value });
  }
  return resolved;
}

/**
 * Resolve the effective attribute scope for a file given the project main file (`rootFileId`).
 *
 * - `rootFileId === null` ⇒ standalone scope (origin `standalone`): only the file's own attributes
 * resolve, with no inherited context.
 * - `fileId === rootFileId` ⇒ root scope (origin `root`): the main file's own attributes.
 * - otherwise ⇒ inherited scope (origin `inherited`): the attributes the file inherits at its
 * FIRST include point from the root, with the file's own definitions applied on top.
 *   A file unreachable from the root inherits nothing.
 *
 * Cycle/depth-safe via the include-graph guard. Unset (`:!name:`), inline `{set:}`, wrapping values,
 * and soft-set precedence are all honored.
 *
 * @param args.rootFileId - The configured main file, or `null` when none is set (standalone).
 * @param args.fileId - The file whose scope to resolve.
 * @param args.readContent - Returns a file's content, or null if unavailable.
 * @param args.resolveInclude - Resolves an include target (from a file) to a file id, or null
 *   (MUST sandbox user-controlled targets).
 * @param args.seedAttributes - Attribute state in effect at the root but not written in source (the
 *   render intrinsics). Seeds the conditional-GATING scope only (not the returned values) so a file
 *   reachable only through an inactive branch inherits nothing, matching the preview. Defaults to ∅.
 * @returns The {@link ResolvedAttributeScope} (values as a ReadonlyMap).
 */
export function resolveAttributeScope(arguments_: ProjectScopeArguments): ResolvedAttributeScope {
  const { rootFileId, fileId, readContent } = arguments_;
  const content = readContent(fileId);
  const origin = rootFileId === null ? 'standalone' : (fileId === rootFileId ? 'root' : 'inherited');
  const seed = inheritedAttributeSeed(arguments_);
  const values = stripReservedAttributes(content === null ? new Map(seed) : applyOwnAttributes(content, seed));
  return { fileId, values, origin };
}
