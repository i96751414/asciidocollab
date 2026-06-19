import { resolveSandboxedPath } from '../lib/asciidoc/sandbox-path';
import { substitutePathAttributes } from '../lib/asciidoc/include-path';
import {
  parseIncludeLevelOffset,
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
 *   (document order wins). Defaults to ∅.
 * @returns The assembled content and the list of unresolved/rejected directives.
 */
export function assembleIncludes(
  rootPath: string,
  readFile: (path: string) => string | null,
  options: { maxDepth?: number; maxExpansions?: number; seedAttributes?: ReadonlyMap<string, string> } = {},
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

  const marker = (from: string, target: string, reason: string): string => {
    unresolved.push({ from, target, reason });
    return `Unresolved directive in ${from} - include::${target}[]`;
  };

  // `baseOffset` is the `:leveloffset:` in effect when this file's content begins (the offset its
  // own include applied). Attribute-form `:leveloffset:` entries inside the file shift a running
  // `offset` relative to that base; an unset returns to it. When an include ends, the assembler
  // re-emits the enclosing file's `offset` so a child's offset change cannot leak past its include
  // (Asciidoctor scopes attribute changes to the include; the inlined assembly must match — FR-010).
  // `overrideContent`, when provided, is the already-sliced (tag-/line-filtered) source to expand in
  // place of the file's raw content — slicing happens on the RAW child source BEFORE expansion, so
  // nested includes inside a kept region still expand, and attribute/leveloffset resolution applies
  // to the slice exactly as it would to a whole include (FR-033/FR-034/FR-035).
  const expand = (
    path: string,
    stack: readonly string[],
    depth: number,
    baseOffset: number,
    overrideContent?: string,
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
      if (!resolved.ok) return [marker(path, rawTarget, resolved.reason)];
      if (stack.includes(resolved.path)) return [marker(path, rawTarget, 'cycle')];
      if (depth + 1 > maxDepth) return [marker(path, rawTarget, 'depth')];
      const rawContent = readFile(resolved.path);
      if (rawContent === null) return [marker(path, rawTarget, 'not-found')];
      // Global fan-out budget: the cycle guard above only blocks an ancestor-chain repeat, so a file
      // re-included along many sibling/diamond paths would otherwise expand exponentially. Once the
      // total budget is spent, refuse further expansions so the worker cannot be driven to OOM by
      // attacker-authored content. Only a real expansion (a found target) counts — a not-found read
      // above expands nothing, so it must not deplete the budget and gate off later valid includes (#6).
      if (expansions >= maxExpansions) return [marker(path, rawTarget, 'limit')];
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
      // The child renders at the offset in effect here plus its include's `leveloffset=` option. It is
      // expanded with that as its base; afterwards the enclosing `offset` is re-emitted as an absolute
      // entry so the parent is restored regardless of what the child did to its own offset (the child
      // may set `:leveloffset:` without resetting it). Both restorations use absolute values so an
      // unbalanced child cannot corrupt the surrounding offset.
      const childOffset = offset + parseIncludeLevelOffset(attributeList);
      const child = expand(resolved.path, [...stack, resolved.path], depth + 1, childOffset, childSource);
      const lines: string[] = [];
      // Set the child's absolute offset (only when the boundary actually shifts it), then restore the
      // enclosing absolute offset afterwards. The restore runs unconditionally because the child may
      // have changed `:leveloffset:` internally without resetting it (Asciidoctor scopes that to the
      // include); re-emitting the enclosing offset reproduces that scoping in the inlined assembly.
      if (childOffset !== offset) lines.push(`:leveloffset: ${absolute(childOffset)}`);
      lines.push(child, `:leveloffset: ${absolute(offset)}`);
      return lines;
    };

    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      // A region opener (`ifeval::[expr]`, or empty-bracket `ifdef`/`ifndef`) or closer (`endif::[]`)
      // moves the shared region stack; the directive line is always emitted verbatim so Asciidoctor
      // sees the conditional. The single-line content form `ifdef::flag[text]` is deliberately NOT a
      // region (no matching endif) — it returns `null` here and falls through to be emitted as text.
      if (conditionals.applyLine(line, attributes) !== null) {
        out.push(line);
        continue;
      }
      // The single-line form `ifdef::flag[include::target[]]` — the gating condition wraps an inline
      // include. Evaluate the condition against current attributes and only expand the inner include
      // when active (and the enclosing regions are too); the directive line is emitted verbatim either
      // way so Asciidoctor still sees the conditional, and no separate region is opened.
      const inlineCond = INLINE_INCLUDE_COND_RE.exec(line);
      if (inlineCond !== null) {
        out.push(line);
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
        applyLineAttributes(line, attributes);
        // Track the attribute-form `:leveloffset:` in effect so a later include's restoration knows
        // the enclosing offset to return to. The line itself is still emitted for Asciidoctor.
        offset = applyLevelOffsetEntry(line, offset, baseOffset);
        out.push(line);
        continue;
      }
      // A whole-line `include::` inside an inactive conditional branch is gated off: the line is left
      // verbatim (Asciidoctor still sees a directive, but it points at a path it cannot read) and its
      // target is never resolved or read. Outside any region — or with every enclosing region active —
      // the include expands normally.
      if (!conditionals.isActive()) {
        out.push(line);
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
