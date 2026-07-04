/**
 * Effective AsciiDoc heading-level rule.
 *
 * The displayed level of a heading is its raw marker level shifted by the `:leveloffset:` in effect
 * at that point in the document, plus any offset inherited from an ancestor include (see
 * {@link inheritedLevelOffset}). A heading whose effective level exceeds {@link MAX_HEADING_LEVEL}
 * is not a heading; a `[discrete]`/`[float]` heading is styled as a heading but excluded
 * from the outline / section folding.
 *
 * This is editor *presentation* logic (how heading lines are styled): it lives in the web layer
 * alongside the CodeMirror decorations that consume it, and is intentionally NOT in
 * `@asciidocollab/shared` (DTOs only) nor in the domain (the frontend must not depend on the domain).
 * The domain owns the separate, server-side structural rules it needs for refactoring.
 */

import {
  hasIncludeLevelOffsetOption,
  parseIncludeLevelOffset,
  applyLevelOffsetEntry,
  applyLineAttributes,
  tracePersistedLevelOffset,
  LEVELOFFSET_ENTRY_RE,
  VERBATIM_FENCE_RE,
} from '@asciidocollab/asciidoc-core';
import { INCLUDE_LINE_RE, ConditionalRegionStack } from '../asciidoc/conditional-regions';

/** AsciiDoc section levels run 0 (`=`, doc title) … 5 (`======`). */
export const MAX_HEADING_LEVEL = 5;

/** The computed level/state of a single heading line. */
export interface HeadingLevelInfo {
  /** 1-based line number. */
  line: number;
  /** Document offset of the line start. */
  from: number;
  /** Raw section level from the marker count (`==` → 1). */
  rawLevel: number;
  /** Raw + active `:leveloffset:` (+ inherited offset). */
  effectiveLevel: number;
  /** `[discrete]`/`[float]` heading — styled but excluded from outline/fold. */
  discrete: boolean;
  /** Effective level exceeds {@link MAX_HEADING_LEVEL} ⇒ not a heading. */
  beyondMax: boolean;
}

/** A parsed `:leveloffset:` operation. */
export type LevelOffsetOp =
  | {
      /** Absolute set: `:leveloffset: N`. */
      kind: 'set';
      /** The absolute offset value. */
      value: number;
    }
  | {
      /** Relative shift: `:leveloffset: +N` / `-N`. */
      kind: 'relative';
      /** The signed delta to apply to the current offset. */
      delta: number;
    }
  | {
      /** Reset to the inherited base: `:leveloffset!:` or empty. */
      kind: 'unset';
    };

const HEADING_RE = /^(={1,6})\s+\S/;
// A delimiter line opens/closes a delimited block whose body is not scanned for headings
// (mirrors the grammar — Heading nodes never appear inside block bodies).
const DELIMITER_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,}|={4,}|\*{4,}|_{4,}|--|\|===|,===|:===)$/;

// Single-line block constructs that sit AT a block boundary: an attribute entry, a
// block-attribute / anchor line (`[.lead]`, `[#id]`, `[[id]]`), a block title (`.Title`),
// a comment line (`//`), or a block macro (`image::x[]`). Like a blank line or a closing
// delimiter — and UNLIKE plain prose — they do not open a paragraph, so a heading glued
// directly beneath one (no blank line) is still a heading. Verified against Asciidoctor and
// the Lezer grammar; see {@link computeHeadingLevels} for the paragraph-absorption rule.
const ATTR_ENTRY_LINE_RE = /^:[A-Za-z0-9][\w-]*!?:/;
const BLOCK_ATTR_LINE_RE = /^\[.+\]$/;
const BLOCK_TITLE_RE = /^\.[^\s.[]/;
const COMMENT_LINE_RE = /^\/\//;
const BLOCK_MACRO_RE = /^[A-Za-z0-9_-]+::\S/;

/**
 * Whether a line, evaluated at a block boundary, is a single-line block construct (not a
 * paragraph). Such a line keeps the next line at a boundary, so a heading immediately
 * below it (no blank line) is still recognised as a heading — matching Asciidoctor and the
 * editor's Lezer grammar.
 */
export function isBoundaryBlockConstruct(trimmedLine: string): boolean {
  return (
    ATTR_ENTRY_LINE_RE.test(trimmedLine) ||
    BLOCK_ATTR_LINE_RE.test(trimmedLine) ||
    BLOCK_TITLE_RE.test(trimmedLine) ||
    COMMENT_LINE_RE.test(trimmedLine) ||
    BLOCK_MACRO_RE.test(trimmedLine)
  );
}

/**
 * Parse a `:leveloffset:` attribute value into an operation, or `null` if not a leveloffset entry.
 * Detection uses the SHARED grammar regex ({@link LEVELOFFSET_ENTRY_RE}) — the same one
 * `applyLevelOffsetEntry` applies with — so the editor's "is this a leveloffset line" decision can
 * never drift from the shared offset authority. Group 1 = prefix `!`, 2 = suffix `!`, 3 = the value.
 */
export function parseLevelOffset(line: string): LevelOffsetOp | null {
  const match = LEVELOFFSET_ENTRY_RE.exec(line);
  if (!match) return null;
  const bang = match[1] === '!' || match[2] === '!';
  const raw = match[3];
  if (bang || raw === '') return { kind: 'unset' };
  if (raw.startsWith('+') || raw.startsWith('-')) {
    const delta = Number.parseInt(raw, 10);
    return Number.isNaN(delta) ? { kind: 'unset' } : { kind: 'relative', delta };
  }
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? { kind: 'unset' } : { kind: 'set', value };
}

/**
 * Capability bag for resolving include directives during heading-level computation.
 * When provided, `computeHeadingLevels` traces attribute-form `:leveloffset:` changes
 * that persist from included files into the current file's running offset.
 */
export interface IncludeResolutionContext {
  /** File ID of the document being processed (used as the `from` for include resolution). */
  fileId: string;
  /**
   * Returns the content of a file by ID, or null when unavailable.
   *
   * @param fileId - The file whose content to retrieve.
   * @returns The file text, or null when unavailable.
   */
  getContent: (fileId: string) => string | null;
  /**
   * Resolves an include target relative to `fromFileId` to a file ID, or null.
   *
   * @param fromFileId - The file from which the include target is resolved.
   * @param target - The include target path (relative to `fromFileId`).
   * @returns The resolved file ID, or null when the target cannot be resolved.
   */
  resolveInclude: (fromFileId: string, target: string) => string | null;
  /**
   * Attribute state for conditional GATING of includes: the render intrinsics plus the open file's
   * inherited attributes (what is in scope but not written in the open file's own source). Seeding it
   * makes the editor gate an `ifdef`/`ifeval`-wrapped include exactly as the preview does, so their
   * effective heading levels never diverge (R2). The walk overlays the open file's own document-order
   * attribute entries on top. `leveloffset` is engine-reserved and never read from here. Default ∅.
   */
  seedAttributes?: ReadonlyMap<string, string>;
}

/**
 * Compute effective heading levels for an AsciiDoc document. `inheritedOffset` is the offset
 * accumulated from ancestor files in the include path (0 when the file is the tree root, or when
 * no main file supplies it).
 *
 * A `==`-line is only a heading at a block boundary. Plain prose opens a paragraph that absorbs
 * every following non-blank line until a blank line, so `prose\n== Foo` is paragraph text — NOT a
 * heading — and must not be folded or styled as one. A blank line, a closing delimited block, or a
 * single-line block construct ({@link isBoundaryBlockConstruct}) keeps the next line at a boundary.
 * This mirrors the editor's Lezer grammar (and Asciidoctor), so folding / font-size styling never
 * diverge from the syntax highlight.
 *
 * @param documentText - The file's full text.
 * @param inheritedOffset - The offset inherited from include ancestors (default 0).
 * @param includeContext - Optional context for tracing include-induced leveloffset changes.
 * @returns One {@link HeadingLevelInfo} per heading line, in document order.
 */
export function computeHeadingLevels(
  documentText: string,
  inheritedOffset = 0,
  includeContext?: IncludeResolutionContext,
): HeadingLevelInfo[] {
  const result: HeadingLevelInfo[] = [];
  const lines = documentText.split('\n');
  let offset = inheritedOffset;
  let cursor = 0; // document offset of the current line start
  // Two independent block states mirror the shared engine's `verbatimRanges` model. A VERBATIM fence
  // (listing/literal/passthrough/comment — {@link VERBATIM_FENCE_RE}) makes its body literal text and is
  // recognised ANYWHERE, even nested inside a structural block, so a code sample inside an example block
  // is not mistaken for real directives. A STRUCTURAL block (example/open/sidebar/quote/table) suppresses
  // only HEADING recognition — the preprocessor still folds attribute entries, evaluates conditionals,
  // and expands includes inside it (a `:leveloffset:` set inside persists after the block), matching the
  // preview render. `openVerbatim`/`openStructural` hold the open delimiter line (closed by an identical
  // line); a verbatim fence takes precedence, and the structural state is remembered across a nested
  // verbatim region.
  let openVerbatim: string | null = null;
  let openStructural: string | null = null;
  let pendingDiscrete = false;
  let inParagraph = false; // inside an open paragraph that absorbs following lines until a blank
  // The include PATH cycle guard (seeded with the open file) and the global fan-out budget are SHARED
  // across every top-level tracePersistedLevelOffset call so an attribute an earlier include set gates a
  // later sibling, a transitive self-include is blocked, and total work stays bounded — while a file
  // re-reached along a different sibling/diamond path is still expanded AGAIN (per occurrence, as the
  // preview assembler does), so a persisting `:leveloffset:` accumulates once per include (matching
  // Asciidoctor) instead of being deduped to a single contribution.
  const includeStack = includeContext ? new Set([includeContext.fileId]) : new Set<string>();
  const includeBudget = { expansions: 0 };
  // Attribute/conditional gating state is only needed to resolve include-induced offset changes, so it
  // is maintained ONLY when the file actually contains an `include::` directive — a file with none has
  // no consumer for it, and skipping the per-line work keeps the common (include-free) case cheap on
  // the decoration hot path. Live document-order attribute state for conditional gating — seeded with
  // the render intrinsics + the open file's inherited attributes (so an intrinsic-/inherited-guarded
  // include gates exactly as the preview renders it, R2) and updated with the open file's own entries
  // as the walk descends. The SAME map is threaded into tracePersistedLevelOffset so an attribute an
  // included file sets gates a later sibling include. `leveloffset` is retained here for gating (as in
  // the shared engine) but the offset is resolved separately, never read from this map.
  const trackGating = includeContext !== undefined && documentText.includes('include::');
  const attributes: Map<string, string> | null = trackGating ? new Map(includeContext!.seedAttributes) : null;
  // Gates include expansion, evaluated against the real `attributes` so gating matches the preview.
  const tracingConditionals = trackGating ? new ConditionalRegionStack() : null;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    // Verbatim block takes precedence: while a verbatim fence is open, EVERY line is literal text (no
    // heading, attribute, conditional, or include processing) until the matching close fence — even
    // `--`/`====` structural delimiters inside it are just sample text. Mirrors the shared engine, whose
    // `verbatimRanges` excludes these ranges wholesale.
    if (openVerbatim !== null) {
      if (trimmed === openVerbatim) openVerbatim = null;
      cursor += line.length + 1;
      continue;
    }

    // Close the enclosing structural block on its matching delimiter.
    if (openStructural !== null && trimmed === openStructural) {
      openStructural = null;
      cursor += line.length + 1;
      continue;
    }
    const inStructuralBody = openStructural !== null;

    // Preprocessor: track conditional regions against the real attribute state, then fold this line's
    // own attribute effects in document order so a later include/conditional sees them. Placed AFTER
    // the verbatim guard and skipping `//` comment lines so directives inside a verbatim block
    // (listing/literal/comment) are treated as literal text — matching the preview's `documentOrderEvents`
    // walk, which excludes verbatim ranges. It DOES run inside a structural block (example/open/sidebar/
    // quote/table), which the preview also processes. Order matters: an `ifdef::x[]` opener is evaluated
    // against attributes established ABOVE it, before this line's own definition (a line is never both).
    if (attributes && !trimmed.startsWith('//')) {
      tracingConditionals?.applyLine(line, attributes);
      applyLineAttributes(line, attributes);
    }

    if (trimmed === '') {
      // A blank line ends a top-level paragraph; inside a structural block it only separates block
      // content and must not touch the document-level paragraph state.
      if (!inStructuralBody) inParagraph = false;
      cursor += line.length + 1;
      continue;
    }

    // Inside a paragraph every non-blank line is absorbed (even one shaped like a heading or a
    // delimiter), so it can start no block construct — exactly as the grammar / Asciidoctor parse it.
    // Paragraph absorption is a top-level flow rule; it does not apply inside a structural block body.
    if (!inStructuralBody && inParagraph) {
      cursor += line.length + 1;
      continue;
    }

    // Open a delimited block. A VERBATIM fence opens a literal region even nested inside a structural
    // block (its body is skipped by the guard above). A STRUCTURAL delimiter opens a heading-suppressing
    // block, tracked one level deep (the walk does not model structural nesting); a structural delimiter
    // already inside a structural body falls through as block content.
    if (DELIMITER_RE.test(trimmed)) {
      if (VERBATIM_FENCE_RE.test(trimmed)) {
        openVerbatim = trimmed;
        pendingDiscrete = false;
        cursor += line.length + 1;
        continue;
      }
      if (!inStructuralBody) {
        openStructural = trimmed;
        pendingDiscrete = false;
        cursor += line.length + 1;
        continue;
      }
    }

    // Within-file attribute-form `:leveloffset:` shifts the running offset via the shared primitive
    // (relative `+N`/`-N` cumulative, absolute `N`, unset back to the inherited base) — the single
    // offset authority, so the editor and the preview resolve it identically. `parseLevelOffset` only
    // detects a `:leveloffset:` line here; the value application flows through `applyLevelOffsetEntry`.
    // Runs inside a structural block too (a `:leveloffset:` set there persists after the block).
    if (parseLevelOffset(line) !== null) {
      offset = applyLevelOffsetEntry(line, offset, inheritedOffset);
      cursor += line.length + 1;
      continue;
    }

    if (includeContext && attributes) {
      const includeMatch = INCLUDE_LINE_RE.exec(line);
      if (includeMatch) {
        const attributeList = includeMatch[2] ?? '';
        if (tracingConditionals?.isActive() !== false) {
          const childId = includeContext.resolveInclude(includeContext.fileId, includeMatch[1].trim());
          if (childId) {
            // Walk the child subtree exactly as the shared engine does: fold its attribute definitions
            // into the gating map (so a later conditional include gates identically to the preview) and
            // trace its final offset from the include point (this include's `leveloffset=` OPTION plus
            // the current offset). The OPTION form scopes only the OFFSET (restored after the include),
            // so its returned offset is discarded; the attribute form persists, so it is adopted. Either
            // way the child's attributes persist (the option scopes the offset, not other attributes).
            const childFinalOffset = tracePersistedLevelOffset({
              fileId: childId,
              baseOffset: offset + parseIncludeLevelOffset(attributeList),
              readContent: includeContext.getContent,
              resolveInclude: includeContext.resolveInclude,
              attributes,
              stack: includeStack,
              budget: includeBudget,
            });
            if (!hasIncludeLevelOffsetOption(attributeList)) offset = childFinalOffset;
          }
        }
        pendingDiscrete = false;
        cursor += line.length + 1;
        continue;
      }
    }

    // Heading, discrete markers, and paragraph opening are top-level section structure — a structural
    // block body contains block content, never a document section, so none of it is recognised there.
    if (inStructuralBody) {
      cursor += line.length + 1;
      continue;
    }

    if (trimmed === '[discrete]' || trimmed === '[float]') {
      pendingDiscrete = true;
      cursor += line.length + 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const rawLevel = heading[1].length - 1;
      const effectiveLevel = rawLevel + offset;
      result.push({
        line: index + 1,
        from: cursor,
        rawLevel,
        effectiveLevel,
        discrete: pendingDiscrete,
        beyondMax: effectiveLevel > MAX_HEADING_LEVEL || effectiveLevel < 0,
      });
      pendingDiscrete = false;
      cursor += line.length + 1;
      continue;
    }

    // A non-blank line that began no block construct opens a paragraph (so a heading glued
    // below it is absorbed) — unless it is itself a single-line block construct, which leaves
    // the next line at a boundary where a heading is still recognised.
    pendingDiscrete = false;
    if (!isBoundaryBlockConstruct(trimmed)) inParagraph = true;
    cursor += line.length + 1;
  }

  return result;
}
