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

import { hasIncludeLevelOffsetOption } from '../asciidoc/extraction';
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
// Asciidoctor unsets an attribute with either the prefix form (`:!leveloffset:`) or the suffix form
// (`:leveloffset!:`); group 1 = prefix `!`, group 2 = suffix `!`, group 3 = the value.
const LEVELOFFSET_RE = /^:(!?)leveloffset(!?):\s*(.*?)\s*$/;
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

/** Parse a `:leveloffset:` attribute value into an operation, or `null` if not a leveloffset entry. */
export function parseLevelOffset(line: string): LevelOffsetOp | null {
  const match = LEVELOFFSET_RE.exec(line);
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

function applyOffset(current: number, op: LevelOffsetOp, base: number): number {
  switch (op.kind) {
    case 'set': {
      return op.value;
    }
    case 'relative': {
      return current + op.delta;
    }
    case 'unset': {
      return base;
    }
  }
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
}

/**
 * Walk `fileText` (the content of file `fileId`) and return the final `:leveloffset:` value
 * after all content has been processed, starting from `baseOffset`. Recursively processes
 * nested includes (up to depth 64), respects the cycle guard (`visited`), and applies the
 * same two-form scoping rule as the include assembler:
 * - `leveloffset=` OPTION: scoped, does not affect the returned offset.
 * - attribute-form `:leveloffset:` inside the file: persists, returned in the final offset.
 *
 * @param fileText - The raw text content of the file to walk.
 * @param fileId - The file ID of the file being walked (for include resolution).
 * @param baseOffset - The offset inherited at the point this file is included.
 * @param context - The include resolution context for following include chains.
 * @param visited - Set of file IDs already visited in this walk (cycle guard).
 * @param depth - Current recursion depth (capped at 64).
 */
const EMPTY_ATTRS = new Map<string, string>();

function traceFinalOffset(
  fileText: string,
  fileId: string,
  baseOffset: number,
  context: IncludeResolutionContext,
  visited: Set<string>,
  depth: number,
): number {
  if (depth > 64 || visited.has(fileId)) return baseOffset;
  visited.add(fileId);
  let offset = baseOffset;
  const conditionals = new ConditionalRegionStack();
  for (const line of fileText.split('\n')) {
    if (conditionals.applyLine(line, EMPTY_ATTRS) !== null) continue;
    if (!conditionals.isActive()) continue;
    const op = parseLevelOffset(line);
    if (op) {
      offset = applyOffset(offset, op, baseOffset);
      continue;
    }
    const includeMatch = INCLUDE_LINE_RE.exec(line);
    if (includeMatch) {
      const attributeList = includeMatch[2] ?? '';
      if (hasIncludeLevelOffsetOption(attributeList)) continue; // option form is scoped
      const childId = context.resolveInclude(fileId, includeMatch[1].trim());
      if (childId) {
        const childContent = context.getContent(childId);
        if (childContent) {
          offset = traceFinalOffset(childContent, childId, offset, context, visited, depth + 1);
        }
      }
    }
  }
  return offset;
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
  let openDelimiter: string | null = null;
  let pendingDiscrete = false;
  let inParagraph = false; // inside an open paragraph that absorbs following lines until a blank
  // Shared across all top-level traceFinalOffset calls so a file reachable via multiple sibling
  // includes (diamond graph) is only traced once (cycle guard shared, not copied per call).
  const includeVisited = includeContext ? new Set([includeContext.fileId]) : new Set<string>();
  // Gates traceFinalOffset calls: conditionals are preprocessor-level so we track them globally
  // (even inside delimited blocks). An empty attribute map makes ifdef::flag[] → inactive, which is
  // conservative: we may miss leveloffset from genuinely-active ifdef blocks, but we never apply
  // offset from inactive ones. Only used when includeContext is provided.
  const tracingConditionals = includeContext ? new ConditionalRegionStack() : null;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    // Preprocessor: always track conditional regions so the include gate below is accurate.
    tracingConditionals?.applyLine(line, EMPTY_ATTRS);

    if (openDelimiter !== null) {
      if (trimmed === openDelimiter) openDelimiter = null;
      cursor += line.length + 1;
      continue;
    }

    if (trimmed === '') {
      inParagraph = false;
      cursor += line.length + 1;
      continue;
    }

    // Inside a paragraph every non-blank line is absorbed (even one shaped like a heading or a
    // delimiter), so it can start no block construct — exactly as the grammar / Asciidoctor parse it.
    if (inParagraph) {
      cursor += line.length + 1;
      continue;
    }

    if (DELIMITER_RE.test(trimmed)) {
      openDelimiter = trimmed;
      pendingDiscrete = false;
      cursor += line.length + 1;
      continue;
    }

    const offsetOp = parseLevelOffset(line);
    if (offsetOp) {
      offset = applyOffset(offset, offsetOp, inheritedOffset);
      cursor += line.length + 1;
      continue;
    }

    if (includeContext) {
      const includeMatch = INCLUDE_LINE_RE.exec(line);
      if (includeMatch) {
        const attributeList = includeMatch[2] ?? '';
        if (!hasIncludeLevelOffsetOption(attributeList) && tracingConditionals?.isActive() !== false) {
          const childId = includeContext.resolveInclude(includeContext.fileId, includeMatch[1].trim());
          if (childId) {
            const childContent = includeContext.getContent(childId);
            if (childContent) {
              offset = traceFinalOffset(childContent, childId, offset, includeContext, includeVisited, 1);
            }
          }
        }
        pendingDiscrete = false;
        cursor += line.length + 1;
        continue;
      }
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
