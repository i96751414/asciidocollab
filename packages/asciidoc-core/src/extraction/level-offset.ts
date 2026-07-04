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

  const captured = new Map<string, number>();
  walkLevelOffset(rootFileId, 0, {
    readContent,
    resolveInclude,
    // Document-order attribute state, seeded with the render intrinsics, mutated as the walk descends
    // (a parent's definitions are in scope for its includes) so conditional gating matches the assembler.
    attributes: new Map<string, string>(seedAttributes),
    stack: new Set<string>(),
    budget: { expansions: 0 },
    captured,
  });
  return captured.get(fileId) ?? 0;
}

/**
 * Maximum include NESTING depth the offset walk descends — the cycle guard bounds distinct files but
 * not the recursion depth of a long linear chain, which could overflow the stack. Matches the preview
 * include assembler's own depth cap, so the two agree on what is "too deep to expand": a file nested
 * beyond this is treated as not expanded (offset 0), exactly as the assembler leaves it.
 */
const MAX_INCLUDE_DEPTH = 64;

/**
 * A GLOBAL ceiling on the total number of include expansions the offset walk performs — mirroring the
 * preview assembler's own `maxExpansions` budget. The path-stack cycle guard only blocks a file from
 * (transitively) including itself; it does NOT stop the same file being re-expanded along many distinct
 * sibling/diamond paths, which is exponential in depth. This budget bounds total work regardless of
 * include-graph shape so attacker-authored content cannot pin the walk (Constitution IX / client-DoS).
 */
const MAX_EXPANSIONS = 10_000;

/** The shared cross-file offset walk's mutable context (see {@link walkLevelOffset}). */
interface LevelOffsetWalkContext {
  readContent: (fileId: string) => string | null;
  resolveInclude: (from: string, target: string) => string | null;
  /** Live document-order attribute state for conditional gating; mutated as the walk descends. */
  attributes: Map<string, string>;
  /**
   * The current DFS include PATH (ancestor chain): a file is added when the walk enters it and removed
   * when it exits, so it blocks only a transitive self-include (a cycle) — NOT a file re-reached along a
   * different sibling/diamond path. This mirrors the assembler's `stack` (which expands each occurrence),
   * so a persisting `:leveloffset:` accumulates once per include EXPANSION exactly as the render does.
   */
  stack: Set<string>;
  /**
   * Global fan-out budget (mutable): total include expansions performed so far across the whole walk.
   * The path stack stops ancestor cycles but not exponential diamond fan-out, so this bounds total work.
   * Shared across sibling traces so a single walk pass is bounded overall (mirrors the assembler).
   */
  budget: { expansions: number };
  /** Optional: records, per file, the offset in effect at its FIRST include point (for effectiveLevelOffset). */
  captured?: Map<string, number>;
}

/**
 * The single cross-file `:leveloffset:` walk shared by {@link effectiveLevelOffset} and
 * {@link tracePersistedLevelOffset} (and, through the latter, the editor heading-level decorations) so
 * the preview, the domain, and the editor can never resolve an offset differently. Walks the include
 * tree from `currentFileId` in document order tracking the running offset. `base` is the offset in
 * effect when this file's content begins (the enclosing include's offset) — an unset `:leveloffset:`
 * returns to it. Returns the final offset after all of this file's content has been processed, which
 * the caller propagates across sibling includes: the `leveloffset=` OPTION form is include-scoped (the
 * caller keeps its own offset), while the attribute-form `:leveloffset:` is NOT scoped (the caller
 * adopts the returned offset). Conditional includes are gated against `context.attributes` — the live
 * document-order attribute state, seeded by the caller with the render intrinsics (and, for the editor,
 * the open file's inherited attributes) and updated as the walk descends — so gating matches what the
 * preview renders.
 */
function walkLevelOffset(currentFileId: string, base: number, context: LevelOffsetWalkContext, depth = 0): number {
  // Beyond the nesting cap the file is not expanded (matching the assembler), so it is neither captured
  // nor walked — this bounds recursion so a pathologically deep chain cannot overflow the stack.
  if (depth > MAX_INCLUDE_DEPTH) return base;
  // Cycle guard: skip a file already on the current include PATH (a transitive self-include). A file
  // re-reached along a DIFFERENT sibling/diamond path is NOT skipped — the assembler expands each
  // occurrence, so the offset walk must too (a persisting `:leveloffset:` accumulates per expansion).
  if (context.stack.has(currentFileId)) return base;
  context.stack.add(currentFileId);
  try {
    // The offset inherited at this file's FIRST include point (first-seen wins across diamond paths) —
    // a stable per-file value for effectiveLevelOffset even though the file may be walked more than once.
    if (context.captured !== undefined && !context.captured.has(currentFileId)) {
      context.captured.set(currentFileId, base);
    }

    const content = context.readContent(currentFileId);
    if (content === null) return base;

    // Global fan-out budget, charged HERE — only for a real expansion: a resolvable, non-cyclic,
    // within-depth, FOUND file that is actually walked. The depth/cycle/not-found rejections above all
    // return before this point WITHOUT charging, exactly as the assembler counts only a resolved+found
    // include (assemble-includes.ts: cycle/depth/not-found checks precede `expansions += 1`). Charging a
    // dead include here — as an earlier version did in the parent, before these guards — would let a
    // pathological run of broken/cyclic/too-deep includes deplete the budget and gate off a later VALID
    // include that the preview still expands, breaking their lockstep. Once spent, this expansion is
    // gated off (returns `base`, contributing no offset) just as the assembler replaces it with a marker.
    if (context.budget.expansions >= MAX_EXPANSIONS) return base;
    context.budget.expansions += 1;

    let offset = base;
    // Per-file stack of open conditional regions (the shared gating authority): an include is walked
    // only when EVERY enclosing region is active (mirrors the assembler), and an empty/unparseable
    // opener still balances its `endif`. The stack is file-local so an unbalanced `if`/`endif` in one
    // file cannot gate another. The offset walk consumes the SAME `documentOrderEvents` stream as the
    // include graph, so gating, `\`-continuation joining, and verbatim skipping cannot diverge.
    const conditionals = new ConditionalRegionStack();
    for (const event of documentOrderEvents(content)) {
      if (event.kind === 'region-open') {
        conditionals.open(event.line, context.attributes);
        continue;
      }
      if (event.kind === 'region-close') {
        conditionals.close();
        continue;
      }
      if (event.kind === 'attribute' || event.kind === 'inline-set') {
        // Track attribute effects (`:name:` / `{set:}`) so conditional gating reflects what precedes
        // each include; the attribute-form `:leveloffset:` also shifts the running offset in document
        // order (an unset returns to `base`). `leveloffset` is engine-reserved so applyAttributeEvent
        // does not retain it in the map — the offset is read from the event value directly here.
        applyAttributeEvent(event, context.attributes);
        if (event.kind === 'attribute' && event.name === 'leveloffset') {
          // `leveloffset` is retained in the map for `ifdef::leveloffset[]` gating; the resolved offset is
          // computed here from the event value directly (the raw map string is never a resolved offset).
          offset = applyLevelOffsetValue(event.value, offset, base);
        }
        continue;
      }
      // An include inside an inactive branch is gated off (never expanded in the preview), so it is
      // not walked and contributes no inherited offset.
      if (!conditionals.isActive()) continue;
      const resolved = context.resolveInclude(currentFileId, event.match[1].trim());
      if (resolved === null) continue;
      // The fan-out budget is charged inside the recursive call, only once the child clears the
      // depth/cycle/not-found guards — so a dead include here never consumes it (see the child).
      const includeAttributeList = event.match[2];
      const includeOffset = parseIncludeLevelOffset(includeAttributeList);
      const childFinalOffset = walkLevelOffset(resolved, offset + includeOffset, context, depth + 1);
      // The `leveloffset=` OPTION is include-scoped: the child's changes are contained, so the
      // parent offset is unchanged after the include. The attribute-form `:leveloffset:` inside the
      // child is NOT scoped — it persists (AsciiDoc semantics), so adopt the child's final offset.
      if (!hasIncludeLevelOffsetOption(includeAttributeList)) {
        offset = childFinalOffset;
      }
    }
    return offset;
  } finally {
    // Pop on exit so the file can be re-entered along a different sibling path (diamond), matching the
    // assembler's per-occurrence expansion — the guard is a path stack, not a permanent visited set.
    context.stack.delete(currentFileId);
  }
}

/**
 * The FINAL persisted level offset of an included file's subtree, given the offset in effect at its
 * include point (`baseOffset`). The attribute-form `:leveloffset:` inside the file (and its non-option
 * nested includes) persists into the returned value; a `leveloffset=` OPTION on a nested include is
 * scoped. This is the cross-file trace the editor's heading-level decorations apply when an include in
 * the open file changes the offset for the headings below it — sharing {@link walkLevelOffset} (and its
 * real conditional gating) with {@link effectiveLevelOffset} so the editor and the preview agree.
 *
 * @param arguments_.fileId - The included file whose subtree to trace.
 * @param arguments_.baseOffset - The offset in effect at the file's include point.
 * @param arguments_.readContent - Returns a file's content, or null if unavailable.
 * @param arguments_.resolveInclude - Resolves an include target (from a file) to a file id, or null
 *   (MUST sandbox user-controlled targets).
 * @param arguments_.attributes - The LIVE document-order attribute state used for conditional gating,
 *   mutated as the walk descends. The caller seeds it (render intrinsics + inherited attributes) and
 *   shares it across sibling traces so an attribute an earlier include set gates a later one.
 * @param arguments_.stack - The current include PATH (ancestor chain) cycle guard, seeded by the caller
 *   with the open file's id. Shared across sibling traces: entries are added on entry and removed on
 *   exit, so a file re-reached along a different path is expanded again (per-occurrence, as the
 *   assembler does) while a transitive self-include is still blocked.
 * @param arguments_.budget - The shared global fan-out budget (mutable `{ expansions }`), so the total
 *   work across all sibling traces of one walk is bounded even for a doubling diamond graph.
 * @returns The file subtree's final persisted offset.
 */
export function tracePersistedLevelOffset(arguments_: {
  fileId: string;
  baseOffset: number;
  readContent: (fileId: string) => string | null;
  resolveInclude: (from: string, target: string) => string | null;
  attributes: Map<string, string>;
  stack: Set<string>;
  budget: { expansions: number };
}): number {
  return walkLevelOffset(arguments_.fileId, arguments_.baseOffset, {
    readContent: arguments_.readContent,
    resolveInclude: arguments_.resolveInclude,
    attributes: arguments_.attributes,
    stack: arguments_.stack,
    budget: arguments_.budget,
  });
}
