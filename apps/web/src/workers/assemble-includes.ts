import { resolveSandboxedPath } from '../lib/asciidoc/sandbox-path';
import { substitutePathAttributes } from '../lib/asciidoc/include-path';
import {
  parseIncludeLevelOffset,
  hasIncludeLevelOffsetOption,
  parseIncludeTags,
  parseIncludeLines,
  applyLineAttributes,
  applyLevelOffsetEntry,
} from '../lib/asciidoc/extraction';
import {
  ConditionalRegionStack,
  parseConditional,
  evaluateConditional,
  INCLUDE_LINE_RE,
} from '../lib/asciidoc/conditional-regions';
import { buildIncludePlaceholderBlock } from '../lib/asciidoc/include-placeholder';

/**
 * Sandbox-confined AsciiDoc include assembler (US8/FR-068, Constitution IX).
 *
 * Pre-expands `include::target[]` directives into a single document before it reaches Asciidoctor,
 * so the preview can render the configured main document with its includes inlined. EVERY target is
 * routed through the shared {@link resolveSandboxedPath} boundary: parent-traversal (`..`), absolute,
 * remote (`http(s)://`), percent-encoded, and otherwise out-of-project targets are rejected and never
 * read — they are replaced with an Asciidoctor "Unresolved directive" marker instead. Cycles and
 * excessive depth are guarded. This is the only place the preview crosses file boundaries, so it must
 * never read a path the boundary did not bless.
 *
 * Conditional preprocessor directives (`ifdef`/`ifndef`/`ifeval`) are evaluated here ONLY to GATE
 * INCLUDES (US8/FR-029..FR-031, research R3): an `include::` wrapped by a conditional region that is
 * inactive for the current document-order attribute state is NOT expanded (its target is never read).
 * The directive lines themselves — and any content-level (non-include) conditional content — are left
 * verbatim in the assembled source so Asciidoctor evaluates content-level conditionals natively with
 * the seeded attributes. Evaluation is `eval`-free (see {@link evaluateConditional}). Nesting, undefined
 * attributes, and unbalanced `endif`/unclosed `if` are tolerated without aborting the assembly.
 */

/** A directive that could not be safely assembled, with the reason it was rejected. */
export interface UnresolvedInclude {
  /** The project-relative path of the file containing the directive. */
  from: string;
  /** The raw include target. */
  target: string;
  /** Why it was not assembled: a sandbox rejection reason, or `not-found` / `cycle` / `depth`. */
  reason: string;
}

/** Result of assembling a document tree from a root file. */
export interface AssembleResult {
  /** The assembled document with in-sandbox includes inlined. */
  content: string;
  /** Every directive that was rejected or could not be resolved, in encounter order. */
  unresolved: UnresolvedInclude[];
}

// An attribute SET entry whose value may wrap: `:name: value` (a prefix/suffix unset has no value to
// continue). Group 1 = name, group 2 = the (raw) value. Used by the assembler to detect a wrapped
// value so its continuation lines can be joined for attribute tracking (FR-041).
const ATTR_SET_LINE_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*(.*)$/;
// A trailing `\` (after optional whitespace) continues an attribute value onto the next line.
const VALUE_CONTINUATION_RE = /\\[ \t]*$/;
// The single-line conditional form `ifdef::flag[include::target[attrs]]` — the conditional's text is
// itself an include directive. Group 1 = the `if*` directive head (re-parsed via parseConditional for
// the gating decision), group 2 = the inner include target, group 3 = the inner include attribute list.
const INLINE_INCLUDE_COND_RE = /^[ \t]*(if(?:def|ndef|eval)::[^[\n]*\[)include::([^[\n]+)\[([^\]\n]*)\]\]\s*$/;
const DEFAULT_MAX_DEPTH = 64;
// A GLOBAL ceiling on the total number of include expansions across the whole assembly. The per-chain
// cycle guard only stops a file from including itself transitively; it does NOT stop the same file
// being re-included along many distinct paths (a diamond / doubling fan-out), which is exponential in
// depth and can OOM/pin the worker on attacker-authored content. This budget bounds total work — and
// therefore total assembled output — regardless of include-graph shape (client-DoS guard, R3). It is
// generous enough for legitimate multi-file books (thousands of includes) while capping pathological
// fan-out; once spent, every further include is gated off with the `limit` reason.
const DEFAULT_MAX_EXPANSIONS = 10_000;

// Matches any attribute-entry line: set (`:name: value`), prefix-unset (`:!name:`), or
// suffix-unset (`:name!:`). These are emitted verbatim in hide mode so Asciidoctor sees them
// in document order and resolves attribute state correctly (029).
const ATTR_ENTRY_RE =
  /^:([A-Za-z0-9][\w-]*):[ \t]*.*$|^:!([A-Za-z0-9][\w-]*):[ \t]*$|^:([A-Za-z0-9][\w-]*)!:[ \t]*$/;

/**
 * Format an ABSOLUTE `:leveloffset:` value entry body. The assembler emits absolute offsets (a bare
 * number, e.g. `2` or `0`) — never a relative `+N`/`-N` — so re-emitting one deterministically sets
 * the offset and an unbalanced child cannot corrupt the surrounding value (FR-010).
 */
function absolute(value: number): string {
  return `${value}`;
}

// A tag marker comment line: `// tag::NAME[]` / `// end::NAME[]` (the AsciiDoc default `//` style,
// plus the `#` and `;;` comment styles), capturing the kind (`tag`/`end`) and the region NAME. The
// marker lines themselves are EXCLUDED from a tag-filtered slice (FR-033).
const TAG_MARKER_RE = /^[ \t]*(?:\/\/|#|;;)[ \t]*(tag|end)::([^[\]]*)\[\][ \t]*$/;

/**
 * Select the lines of `source` chosen by `selectors`, excluding the `// tag::`/`// end::` marker lines
 * themselves (FR-033). This reproduces Asciidoctor's tag-filtering algorithm, including the wildcard
 * semantics that distinguish `*` from `**` (#5):
 *  - a bare `name` selects that region; `!name` deselects it.
 *  - `*` selects any TAGGED region but NOT lines outside a region; `**` selects ALL lines (tagged AND
 *    untagged). `**` is applied first regardless of where it appears, then `*` refines tagged lines.
 *  - `!*` selects only untagged content (it implies `**;!*`); `!**` deselects everything.
 *  - when only exclusions are given, every other line is selected by default.
 * A non-matching selector simply yields no lines (graceful empty slice — FR-036).
 */
function selectTaggedLines(source: string, selectors: readonly string[]): string {
  // Parse selectors into name→include directives (last write wins); `!name` ⇒ false.
  const directives = new Map<string, boolean>();
  for (const token of selectors) {
    if (token === '' || token === '!') continue;
    if (token.startsWith('!')) directives.set(token.slice(1), false);
    else directives.set(token, true);
  }

  // Resolve the base selection (for lines outside any kept region) and the `wildcard` applied to a
  // tag that is not explicitly named — mirroring Asciidoctor's `**`-then-`*` precedence.
  let select: boolean;
  let baseSelect: boolean;
  let wildcard: boolean | undefined;
  if (directives.has('**')) {
    select = baseSelect = directives.get('**')!;
    directives.delete('**');
    if (directives.has('*')) {
      wildcard = directives.get('*');
      directives.delete('*');
    } else if (!select && directives.values().next().value === false) {
      wildcard = true;
    }
  } else if (directives.has('*')) {
    wildcard = directives.get('*');
    directives.delete('*');
    select = baseSelect = !wildcard;
  } else {
    // No wildcard: select everything by default only when every directive is an exclusion.
    select = baseSelect = ![...directives.values()].includes(true);
  }

  // Stack of [tagName, selectWhileOpen]; restoring on `end::` reproduces include-scoped nesting.
  const stack: Array<[string, boolean]> = [];
  let activeTag: string | null = null;
  const kept: string[] = [];
  for (const line of source.split('\n')) {
    const marker = TAG_MARKER_RE.exec(line);
    if (marker !== null) {
      const name = marker[2].trim();
      if (marker[1] === 'tag') {
        if (directives.has(name)) {
          select = directives.get(name)!;
          stack.push([(activeTag = name), select]);
        } else if (wildcard !== undefined) {
          // A nested unlisted tag inside an already-deselected region stays deselected.
          select = activeTag !== null && !select ? false : wildcard;
          stack.push([(activeTag = name), select]);
        }
        // else: unlisted tag with no wildcard — not tracked; `select` is unchanged.
      } else if (name === activeTag) {
        stack.pop();
        [activeTag, select] = stack.at(-1) ?? [null, baseSelect];
      }
      // Marker lines are never emitted.
      continue;
    }
    if (select) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Select the 1-based line ranges of `source` chosen by `ranges`, preserving original line order. A
 * `[start, null]` range is open-ended (to EOF). Out-of-range bounds simply contribute nothing, so an
 * entirely out-of-range selection yields an empty slice (graceful — FR-034/FR-036).
 */
function selectLineRanges(source: string, ranges: ReadonlyArray<readonly [number, number | null]>): string {
  const lines = source.split('\n');
  const keep = (oneBased: number): boolean =>
    ranges.some(([start, end]) => oneBased >= start && (end === null || oneBased <= end));
  return lines.filter((_line, index) => keep(index + 1)).join('\n');
}

/**
 * Assemble the document rooted at `rootPath`, inlining sandbox-approved includes.
 *
 * @param rootPath - The project-relative path of the root (main) file.
 * @param readFile - Returns a project-relative path's content, or null if unavailable.
 * @param options - Optional `maxDepth` (default 64) bounding include nesting, `maxExpansions`
 *   (default 10000) — a GLOBAL ceiling on the total number of include expansions guarding against
 *   exponential fan-out (a file re-included along many paths) that the per-chain cycle guard cannot
 *   catch — and `seedAttributes`:
 *   the attribute state already in effect when the root's content begins but NOT written as `:name:`
 *   lines in the source — Asciidoctor's intrinsics (`backend-html5`, `filetype-html`, `doctype-article`,
 *   …) and any API-seeded values. They must be in scope so conditional include-gating and `{attr}`
 *   target substitution agree with the eventual render; an in-document entry still overrides a seed
 *   (document order wins). Defaults to ∅. `showIncludes` (default `undefined`, treated as `true`)
 *   controls hide mode: when `false`, included file bodies are suppressed and replaced with a
 *   passthrough placeholder block, while attribute-entry lines are still emitted so Asciidoctor
 *   resolves attribute state correctly (029/FR-003/FR-005).
 * @returns The assembled content and the list of unresolved/rejected directives.
 */
export function assembleIncludes(
  rootPath: string,
  readFile: (path: string) => string | null,
  options: { maxDepth?: number; maxExpansions?: number; seedAttributes?: ReadonlyMap<string, string>; showIncludes?: boolean } = {},
): AssembleResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  // Total include expansions performed so far, across every path of the walk — the global fan-out budget.
  let expansions = 0;
  const unresolved: UnresolvedInclude[] = [];
  // Attribute values accumulate across the assembled tree so `include::{partsdir}/x.adoc[]`
  // resolves like Asciidoctor (document order; a parent's definitions are in scope for its includes).
  // Seeded with the attributes already in effect at the root (intrinsics + API attributes) so gating
  // and path substitution match the render; in-document entries override them in document order.
  const attributes = new Map<string, string>(options.seedAttributes);
  // When false, hide included bodies and emit attribute-entry lines only (029).
  const hideMode = options.showIncludes === false;

  // `baseOffset` is the `:leveloffset:` in effect when this file's content begins (the offset its
  // own include applied). Attribute-form `:leveloffset:` entries inside the file shift a running
  // `offset` relative to that base; an unset returns to it. When an include ends, the assembler
  // re-emits the enclosing file's `offset` so a child's offset change cannot leak past its include
  // (Asciidoctor scopes attribute changes to the include; the inlined assembly must match — FR-010).
  // `overrideContent`, when provided, is the already-sliced (tag-/line-filtered) source to expand in
  // place of the file's raw content — slicing happens on the RAW child source BEFORE expansion, so
  // nested includes inside a kept region still expand, and attribute/leveloffset resolution applies
  // to the slice exactly as it would to a whole include (FR-033/FR-034/FR-035).
  // `emit` controls whether non-attribute lines are included in the output. When `false` (used for
  // hidden subtrees in hide mode), only attribute-entry lines are emitted so the attribute state
  // is preserved for downstream content while the body is suppressed (029/FR-005).
  const expand = (
    path: string,
    stack: readonly string[],
    depth: number,
    baseOffset: number,
    overrideContent?: string,
    emit: boolean = true,
  ): string => {
    const content = overrideContent ?? readFile(path);
    if (content === null) return '';
    const out: string[] = [];
    let offset = baseOffset;
    // A stack of open conditional regions within THIS file (the shared gating authority), each marked
    // active/inactive at the point it opened (evaluated against the document-order attribute state then
    // in scope). An include is gated only when EVERY enclosing region is active; a single inactive
    // ancestor suffices to skip it. An empty/unparseable opener (`ifeval::[]`) still balances its
    // `endif`. The directive lines that open/close regions are still emitted verbatim for Asciidoctor.
    const conditionals = new ConditionalRegionStack();

    // Resolve + expand a single include target (sandbox-confined) at the current `offset`, returning
    // the lines to emit: the inlined child wrapped in absolute `:leveloffset:` set/restore entries, or
    // a single "Unresolved directive" marker line when the target is rejected/cyclic/too deep/missing.
    // Shared by the whole-line include path and the single-line `ifdef::flag[include::…]` form.
    const expandIncludeLine = (rawTarget: string, attributeList: string): string[] => {
      const target = substitutePathAttributes(rawTarget, attributes);
      const resolved = resolveSandboxedPath(path, target);
      if (!resolved.ok) {
        unresolved.push({ from: path, target: rawTarget, reason: resolved.reason });
        if (!emit) return [];
        if (hideMode) return [buildIncludePlaceholderBlock(rawTarget)];
        return [`Unresolved directive in ${path} - include::${rawTarget}[]`];
      }
      if (stack.includes(resolved.path)) {
        unresolved.push({ from: path, target: rawTarget, reason: 'cycle' });
        if (!emit) return [];
        if (hideMode) return [buildIncludePlaceholderBlock(resolved.path)];
        return [`Unresolved directive in ${path} - include::${rawTarget}[]`];
      }
      if (depth + 1 > maxDepth) {
        unresolved.push({ from: path, target: rawTarget, reason: 'depth' });
        if (!emit) return [];
        if (hideMode) return [buildIncludePlaceholderBlock(resolved.path)];
        return [`Unresolved directive in ${path} - include::${rawTarget}[]`];
      }
      const rawContent = readFile(resolved.path);
      if (rawContent === null) {
        unresolved.push({ from: path, target: rawTarget, reason: 'not-found' });
        if (!emit) return [];
        if (hideMode) return [buildIncludePlaceholderBlock(resolved.path)];
        return [`Unresolved directive in ${path} - include::${rawTarget}[]`];
      }
      // Global fan-out budget: the cycle guard above only blocks an ancestor-chain repeat, so a file
      // re-included along many sibling/diamond paths would otherwise expand exponentially. Once the
      // total budget is spent, refuse further expansions so the worker cannot be driven to OOM by
      // attacker-authored content. Only a real expansion (a found target) counts — a not-found read
      // above expands nothing, so it must not deplete the budget and gate off later valid includes (#6).
      if (expansions >= maxExpansions) {
        unresolved.push({ from: path, target: rawTarget, reason: 'limit' });
        if (!emit) return [];
        if (hideMode) return [buildIncludePlaceholderBlock(resolved.path)];
        return [`Unresolved directive in ${path} - include::${rawTarget}[]`];
      }
      expansions += 1;
      // Partial include: slice the RAW child source by `tags=`/`lines=` BEFORE expansion. `lines=`
      // is applied first (a raw line range), then `tags=` region selection — Asciidoctor applies a
      // single filter per directive, but applying both deterministically (lines then tags) keeps the
      // common single-selector case exact and never throws. A non-matching/out-of-range selection
      // yields an empty slice, which inlines as no content without breaking the surrounding doc
      // (FR-033/FR-034/FR-036). `null` from either parser means "no filter" (whole content).
      let childSource = rawContent;
      const lineRanges = parseIncludeLines(attributeList);
      if (lineRanges !== null) childSource = selectLineRanges(childSource, lineRanges);
      const tagSelectors = parseIncludeTags(attributeList);
      if (tagSelectors !== null) childSource = selectTaggedLines(childSource, tagSelectors);
      // The child renders at the offset in effect here plus its include's `leveloffset=` option.
      // The `leveloffset=` OPTION form is include-scoped (Asciidoctor restores the offset after the
      // include ends), so the parent emits an absolute set before the child and an absolute restore
      // afterwards. The attribute-form `:leveloffset:` INSIDE the child is NOT include-scoped — it
      // persists into the parent exactly as any other attribute change would (AsciiDoc semantics). In
      // that case no restore is emitted; the child's accumulated lines (which already contain the
      // verbatim `:leveloffset: +N` entry) leave the offset shifted for subsequent content.
      const hasLevelOffsetOption = hasIncludeLevelOffsetOption(attributeList);
      const childOffset = offset + parseIncludeLevelOffset(attributeList);

      if (!emit || hideMode) {
        // Hidden subtree (emit:false) OR visible-but-hide-mode: expand child for attributes only.
        // In emit:false mode we are already inside a suppressed subtree — no placeholder emitted here.
        // In emit:true + hideMode: emit a placeholder for this top-level include, then scan the child
        // for attribute entries only (emit:false).
        const childAttributes = expand(resolved.path, [...stack, resolved.path], depth + 1, childOffset, childSource, false);
        const lines: string[] = [];
        if (hideMode && emit) lines.push(buildIncludePlaceholderBlock(resolved.path));
        if (childOffset !== offset) lines.push(`:leveloffset: ${absolute(childOffset)}`);
        lines.push(childAttributes);
        if (hasLevelOffsetOption) lines.push(`:leveloffset: ${absolute(offset)}`);
        return lines;
      }

      // Show mode (emit:true, !hideMode): full expansion.
      const child = expand(resolved.path, [...stack, resolved.path], depth + 1, childOffset, childSource, true);
      const lines: string[] = [];
      // Emit the child's absolute offset when the include OPTION shifts it; restore the enclosing
      // offset afterwards (option form is scoped). When no `leveloffset=` option, the child's
      // inlined content already carries any attribute-form `:leveloffset:` entries verbatim — they
      // persist into the parent as native Asciidoctor would let them, so no restore is emitted.
      if (childOffset !== offset) lines.push(`:leveloffset: ${absolute(childOffset)}`);
      lines.push(child);
      if (hasLevelOffsetOption) lines.push(`:leveloffset: ${absolute(offset)}`);
      return lines;
    };

    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      // A region opener (`ifeval::[expr]`, or empty-bracket `ifdef`/`ifndef`) or closer (`endif::[]`)
      // moves the shared region stack; in emit:true mode the directive line is emitted verbatim so
      // Asciidoctor sees the conditional. In emit:false (hidden-subtree attribute scan) the directive
      // is NOT emitted — leaking child conditionals into the parent would corrupt its conditional state.
      // The single-line content form `ifdef::flag[text]` is deliberately NOT a region (no matching
      // endif) — it returns `null` here and falls through to be emitted as text.
      if (conditionals.applyLine(line, attributes) !== null) {
        if (emit) out.push(line);
        continue;
      }
      // The single-line form `ifdef::flag[include::target[]]` — the gating condition wraps an inline
      // include. Evaluate the condition against current attributes and only expand the inner include
      // when active (and the enclosing regions are too); the directive line is emitted verbatim in
      // emit:true mode so Asciidoctor still sees the conditional. In emit:false mode the line is
      // suppressed so child conditionals do not corrupt the parent's preprocessor state.
      const inlineCond = INLINE_INCLUDE_COND_RE.exec(line);
      if (inlineCond !== null) {
        if (emit) out.push(line);
        const condition = parseConditional(inlineCond[1] + ']');
        const active = condition !== null && evaluateConditional(condition, attributes);
        if (active && conditionals.isActive()) out.push(...expandIncludeLine(inlineCond[2], inlineCond[3]));
        continue;
      }
      const match = INCLUDE_LINE_RE.exec(line);
      if (!match) {
        // A wrapping attribute value (`:name: value \` continued on the next line) must be JOINED
        // before tracking, because applyLineAttributes works on a single physical line and would
        // otherwise track only the first fragment (with the trailing `\`). Each physical line is still
        // emitted verbatim so Asciidoctor performs its own native join and `data-source-line` mapping
        // is preserved — only the value the assembler TRACKS is joined (FR-041).
        // Attribute-set continuation lines are always emitted (even in emit:false mode) because they
        // constitute attribute-entry lines that must survive into the assembled output.
        const setEntry = ATTR_SET_LINE_RE.exec(line);
        if (setEntry !== null && VALUE_CONTINUATION_RE.test(setEntry[2])) {
          out.push(line);
          let joined = setEntry[2];
          while (VALUE_CONTINUATION_RE.test(joined) && lineIndex + 1 < lines.length) {
            lineIndex += 1;
            const continuation = lines[lineIndex];
            out.push(continuation);
            joined = joined.replace(VALUE_CONTINUATION_RE, '').trimEnd() + ' ' + continuation.trim();
          }
          applyLineAttributes(`:${setEntry[1]}: ${joined.trimEnd()}`, attributes);
          offset = applyLevelOffsetEntry(line, offset, baseOffset);
          continue;
        }
        // Apply this line's attribute effects in document order so an include sees only the
        // attributes defined ABOVE it (matching extraction.ts / Asciidoctor): set/unset and inline
        // `{set:}` all count, with soft-set precedence. A parent's definitions persist into its
        // includes, but an attribute defined (or unset) after an include is not in scope for it.
        if (emit) {
          applyLineAttributes(line, attributes);
          // Track the attribute-form `:leveloffset:` in effect so a later include's restoration knows
          // the enclosing offset to return to. The line itself is still emitted for Asciidoctor.
          offset = applyLevelOffsetEntry(line, offset, baseOffset);
          // In hide mode, substitute known attribute references in prose lines so the assembled
          // content already reflects the values defined by hidden includes — the writer sees resolved
          // values in the preview rather than raw `{attr}` placeholders (029/SC-001).
          // Attribute-entry lines are emitted verbatim (they define attributes, not reference them);
          // non-entry prose lines have their `{name}` refs expanded against the current attribute map.
          const emittedLine =
            hideMode && !ATTR_ENTRY_RE.test(line)
              ? substitutePathAttributes(line, attributes)
              : line;
          out.push(emittedLine);
        } else {
          // emit:false — keep bookkeeping but only emit attribute-entry lines.
          // Snapshot the attribute map to detect inline {set:} mutations on non-attribute-entry prose.
          const isAttributeEntry = ATTR_ENTRY_RE.test(line);
          const previousSnapshot = isAttributeEntry ? null : new Map(attributes);
          applyLineAttributes(line, attributes);
          offset = applyLevelOffsetEntry(line, offset, baseOffset);
          if (isAttributeEntry) {
            // Attribute-entry lines are always emitted so Asciidoctor sees them in document order.
            out.push(line);
          } else if (previousSnapshot !== null) {
            // Prose line: check whether an inline {set:name:value} mutated the attribute map and, if
            // so, emit synthetic `:name: value` lines so the change survives into the assembled output.
            for (const [key, value] of attributes) {
              if (previousSnapshot.get(key) !== value) {
                out.push(`:${key}: ${value}`);
              }
            }
            for (const key of previousSnapshot.keys()) {
              if (!attributes.has(key)) {
                out.push(`:${key}!:`);
              }
            }
          }
        }
        continue;
      }
      // A whole-line `include::` inside an inactive conditional branch is gated off. In emit:true mode
      // the line is left verbatim so Asciidoctor sees the directive (it cannot read the path anyway).
      // In emit:false (hidden-subtree attribute scan) the line is suppressed: a raw include:: from a
      // suppressed child must not surface in the assembled output where Asciidoctor would try to resolve
      // it in the parent context. Target is never resolved or read in either case.
      if (!conditionals.isActive()) {
        if (emit) out.push(line);
        continue;
      }
      out.push(...expandIncludeLine(match[1].trim(), match[2]));
    }
    return out.join('\n');
  };

  if (readFile(rootPath) === null) {
    return { content: '', unresolved: [{ from: '', target: rootPath, reason: 'not-found' }] };
  }
  return { content: expand(rootPath, [rootPath], 0, 0), unresolved };
}
