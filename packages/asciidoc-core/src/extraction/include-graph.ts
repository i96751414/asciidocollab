/**
 * The transitive include graph. `buildIncludeGraphWithInheritance` walks `include::` directives from
 * a root file in document order, recording each edge, unresolved target, and — per file — the
 * attributes it inherits at its first include point. Includes inside inactive conditional branches are
 * gated off exactly as the preview assembler gates them, and the attribute accumulation reuses the
 * shared document-order engine so a child sees only what a parent defined ABOVE its include. The single
 * copy shared by the server (`@asciidocollab/domain`) and the editor (`apps/web`).
 */
import type { DocumentTree, IncludeEdge, UnresolvedInclude } from '../types';
import { substitutePathAttributes } from '../attribute-substitution';
import { ConditionalRegionStack } from '../conditional-regions';
import { rangeOf } from './text-ranges';
import { documentOrderEvents, applyAttributeEvent } from './document-order';
import { parseIncludeLevelOffset } from './level-offset';

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
 * Build the transitive include graph from a root file, recording the attributes each file
 * inherits from its ancestors.
 *
 * Cycle-guarded (a file is visited once), so a recursive include (file a includes file b which
 * includes file a) terminates instead of looping. Each edge carries the `leveloffset=` declared
 * on its include. Attribute values accumulate in document order across the whole walk: a child
 * include is resolved against the attributes known when its directive is reached, so a parent's
 * header attributes are in scope but attributes the parent defines after the include are not.
 *
 * @param rootFileId - The main/current file id.
 * @param readContent - Returns a file's content, or null if unavailable.
 * @param resolveInclude - Resolves an include target (from a file) to a file id, or null.
 *   SECURITY (Constitution IX): include `target`s are user-controlled, so this callback
 *   MUST sandbox them via `resolveSandboxedPath` (the web symbol index does) — this pure
 *   model deliberately performs no filesystem access and cannot confine paths itself.
 * @param seedAttributes - Attribute state in effect at the root but not written in source (the
 *   render intrinsics, e.g. `backend-html5`). It seeds the conditional-GATING scope only — so an
 *   `ifdef::backend-html5[]include::…]` resolves active here exactly as the preview assembler gates
 *   it — and is NOT folded into the returned inherited attribute values. Defaults to ∅.
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
  // Accumulates attribute definitions in document order across the descent so a child include
  // can use an attribute a parent defined above it (later definition wins, soft-set/unset
  // precedence applied by applyAttributeEvent).
  const attributes = new Map<string, string>();
  const hasSeed = seedAttributes !== undefined && seedAttributes.size > 0;
  // The scope used ONLY to evaluate conditional gating: the document-order attributes overlaid on the
  // gating seed (in-document entries win). Kept separate from `attributes` so the render intrinsics
  // never leak into the inherited values the walk returns. Built lazily — gating directives are rare.
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

    // Per-file region stack (the shared gating authority) — an include is walked only when every
    // enclosing region is active, mirroring the assembler/effectiveLevelOffset so attribute
    // inheritance agrees with what the preview renders. File-local: an unbalanced if/endif in one
    // file cannot gate another.
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
        // Apply set/unset/inline-set in document order, resolving nested `{ref}`s in the value
        // against the attributes defined so far, so an inherited value like `:full: {first} Doe` is
        // stored — and inherited — fully expanded (Asciidoctor resolves it at definition time). A
        // forward reference stays verbatim.
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
 * @param seedAttributes - Attribute state in effect at the root but not written in source (the
 *   render intrinsics). It seeds the conditional-GATING scope so this walk discovers the same nodes the
 *   symbol index, effective-offset walk, and preview render do — an `ifdef::backend-html5[]` include is
 *   walked, not dropped. Defaults to ∅.
 * @returns The transitive {@link DocumentTree}.
 */
export function buildIncludeGraph(
  rootFileId: string,
  readContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
  seedAttributes?: ReadonlyMap<string, string>,
): DocumentTree {
  return buildIncludeGraphWithInheritance(rootFileId, readContent, resolveInclude, seedAttributes).tree;
}
