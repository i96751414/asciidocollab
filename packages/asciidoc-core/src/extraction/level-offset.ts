/**
 * `leveloffset` resolution: parsing the `leveloffset=` include OPTION and the attribute-form
 * `:leveloffset:` entry, and the two inheritance walks (`inheritedLevelOffset` sums include-option
 * offsets along the path; `effectiveLevelOffset` also folds attribute-form changes in document order,
 * with include-scoping and conditional gating). Both walks consume the shared `documentOrderEvents`
 * stream so gating and value handling cannot diverge from the include graph. The single copy shared by the server (@asciidocollab/domain) and the editor (apps/web).
 */
import type { DocumentTree, IncludeEdge } from '../types';
import { ConditionalRegionStack } from '../conditional-regions';
import { LEVELOFFSET_ENTRY_RE } from './grammar';
import { documentOrderEvents, applyAttributeEvent } from './document-order';

/** Parse `leveloffset=+N` / `-N` / `N` from an include directive's attribute list. */
export function parseIncludeLevelOffset(attributes: string): number {
  const match = /leveloffset\s*=\s*([+-]?\d+)/.exec(attributes);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Whether an include directive's attribute list contains a `leveloffset=` option.
 * The `leveloffset=` OPTION is include-scoped — Asciidoctor restores the offset after the include.
 * The attribute-form `:leveloffset:` INSIDE the included file is NOT scoped — it persists.
 * This is the single authority for that distinction; callers must not re-check the attribute list.
 *
 * @param attributeList - The raw attribute list string from an `include::target[...]` directive.
 */
export function hasIncludeLevelOffsetOption(attributeList: string): boolean {
  return /leveloffset\s*=/.test(attributeList);
}

/**
 * Apply one attribute-form `:leveloffset:` entry to a running offset, returning the new offset.
 * `base` is the value an unset/empty entry returns to (the offset inherited at the enclosing
 * include point). A relative `+N`/`-N` shifts the current offset; an absolute `N` replaces it.
 * Returns `current` unchanged when the line is not a `:leveloffset:` entry. Shared with the preview
 * include assembler so its inlined `:leveloffset:` tracking matches this resolution layer exactly.
 */
export function applyLevelOffsetEntry(line: string, current: number, base: number): number {
  const match = LEVELOFFSET_ENTRY_RE.exec(line);
  if (match === null) return current;
  const unset = match[1] === '!' || match[2] === '!';
  return applyLevelOffsetValue(unset ? null : match[3], current, base);
}

/**
 * Apply a `:leveloffset:` attribute VALUE (the document-order event value) to a running offset — the
 * value-based core of {@link applyLevelOffsetEntry}. An unset (`null`) or empty value returns to
 * `base`; a relative `+N`/`-N` shifts `current`; an absolute `N` replaces it. Lets the offset walk
 * consume the same document-order attribute events as the inheritance walk instead of re-scanning lines.
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

/**
 * The level offset inherited by a file from its ancestors along the first
 * document-order path from the root (sum of edge `leveloffset`s). 0 for the root
 * or an unreachable file.
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
 * must apply to that file's raw heading levels.
 *
 * Unlike {@link inheritedLevelOffset} (which sums only the `leveloffset=` include OPTIONS along the
 * path), this also folds in the attribute-form `:leveloffset:` entries a parent declares ABOVE the
 * include, in document order. Each include is INCLUDE-SCOPED: a `:leveloffset:` an ancestor changes
 * inside one include — even unbalanced — is restored to the value in effect before that include when
 * it ends, so the change cannot leak into a sibling include or back into the parent. The walk reuses
 * the include-graph cycle guard and first-visit-wins semantics.
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
 *   (MUST sandbox user-controlled targets).
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
  // Returns the final offset after all content in this file has been processed. The caller uses this
  // to propagate attribute-form `:leveloffset:` changes across sibling includes: the `leveloffset=`
  // OPTION form is include-scoped (caller ignores the returned offset and keeps its own), while the
  // attribute form is NOT scoped (caller adopts the returned offset for subsequent sibling includes).
  const walk = (currentFileId: string, base: number): number => {
    if (visited.has(currentFileId)) return base;
    visited.add(currentFileId);
    captured.set(currentFileId, base); // the offset inherited at this file's first include point

    const content = readContent(currentFileId);
    if (content === null) return base;

    let offset = base;
    // Per-file stack of open conditional regions (the shared gating authority): an include is walked
    // only when EVERY enclosing region is active (mirrors the assembler), and an empty/unparseable
    // opener still balances its `endif`. The stack is file-local so an unbalanced `if`/`endif` in one
    // file cannot gate another. The offset walk consumes the SAME `documentOrderEvents` stream as the
    // include graph, so gating, `\`-continuation joining, and verbatim skipping cannot diverge.
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
      const includeAttributeList = event.match[2];
      const includeOffset = parseIncludeLevelOffset(includeAttributeList);
      const childFinalOffset = walk(resolved, offset + includeOffset);
      // The `leveloffset=` OPTION is include-scoped: the child's changes are contained, so the
      // parent offset is unchanged after the include. The attribute-form `:leveloffset:` inside the
      // child is NOT scoped — it persists (AsciiDoc semantics), so adopt the child's final offset.
      if (!hasIncludeLevelOffsetOption(includeAttributeList)) {
        offset = childFinalOffset;
      }
    }
    return offset;
  };

  walk(rootFileId, 0);
  return captured.get(fileId) ?? 0;
}
