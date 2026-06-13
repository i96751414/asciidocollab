/**
 * Effective AsciiDoc heading-level rule (US3, FR-009/010/071/072).
 *
 * The displayed level of a heading is its raw marker level shifted by the `:leveloffset:` in effect
 * at that point in the document, plus any offset inherited from an ancestor include (see
 * {@link inheritedLevelOffset}). A heading whose effective level exceeds {@link MAX_HEADING_LEVEL}
 * is not a heading (FR-010); a `[discrete]`/`[float]` heading is styled as a heading but excluded
 * from the outline / section folding (FR-072).
 *
 * This rule lives in the shared model so it exists exactly once (Constitution IV): the web CodeMirror
 * layer is a thin projection that applies decorations over the result, and the preview/assembly paths
 * can reuse the same computation.
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

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (openDelimiter !== null) {
      if (trimmed === openDelimiter) openDelimiter = null;
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

    if (trimmed !== '') pendingDiscrete = false;
    cursor += line.length + 1;
  }

  return result;
}
