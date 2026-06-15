/**
 * Effective AsciiDoc heading-level rule (US3, FR-009/010/071/072).
 *
 * The displayed level of a heading is its raw marker level shifted by the `:leveloffset:` in effect
 * at that point in the document, plus any offset inherited from an ancestor include (see
 * {@link inheritedLevelOffset}). A heading whose effective level exceeds {@link MAX_HEADING_LEVEL}
 * is not a heading (FR-010); a `[discrete]`/`[float]` heading is styled as a heading but excluded
 * from the outline / section folding (FR-072).
 *
 * This is editor *presentation* logic (how heading lines are styled): it lives in the web layer
 * alongside the CodeMirror decorations that consume it, and is intentionally NOT in
 * `@asciidocollab/shared` (DTOs only) nor in the domain (the frontend must not depend on the domain).
 * The domain owns the separate, server-side structural rules it needs for refactoring.
 */

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
  /** Effective level exceeds {@link MAX_HEADING_LEVEL} ⇒ not a heading (FR-010). */
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
const LEVELOFFSET_RE = /^:leveloffset(!?):\s*(.*?)\s*$/;
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
  const bang = match[1] === '!';
  const raw = match[2];
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
 * Compute effective heading levels for an AsciiDoc document. `inheritedOffset` is the offset
 * accumulated from ancestor files in the include path (0 when the file is the tree root, or when
 * no main file supplies it — FR-071).
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
 * @returns One {@link HeadingLevelInfo} per heading line, in document order.
 */
export function computeHeadingLevels(documentText: string, inheritedOffset = 0): HeadingLevelInfo[] {
  const result: HeadingLevelInfo[] = [];
  const lines = documentText.split('\n');
  let offset = inheritedOffset;
  let cursor = 0; // document offset of the current line start
  let openDelimiter: string | null = null;
  let pendingDiscrete = false;
  let inParagraph = false; // inside an open paragraph that absorbs following lines until a blank

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

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
