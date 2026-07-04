/**
 * Pure, dependency-free AsciiDoc list-marker parser.
 *
 * `parseListMarker` inspects a single line of editor source and, when that line is a
 * recognized list item (unordered, ordered, checklist, or description), returns an immutable
 * {@link ListMarker} descriptor; otherwise it returns `null`. It has **no CodeMirror imports**
 * so it can be unit-tested as plain string→object cases in the fast `node` Jest project, and
 * the CodeMirror Enter command ({@link ./asciidoc-list-continuation}) consumes its output to
 * decide continue / exit / fall-through.
 */

/** Which marker family a line matched. */
export type ListKind = 'unordered' | 'ordered' | 'checklist' | 'description';

/** Immutable descriptor of the list item on the current line (see data-model.md). */
export interface ListMarker {
  /** Which marker family matched. */
  readonly kind: ListKind;
  /** Leading whitespace before the marker, preserved verbatim on continuation. */
  readonly indent: string;
  /** The marker text to reason about (e.g. `**`, `-`, `..`, `1.`, the `*`/`-` of a checklist, `::`, `;;`). */
  readonly marker: string;
  /** Nesting depth: count of `*`/`.`/`:` units; `1` for `-` and explicit-number ordered. */
  readonly depth: number;
  /** Offset within the line where item content begins (after marker + separating space). */
  readonly contentStart: number;
  /** `true` when nothing but the marker (and empty checkbox / separator) plus whitespace is present. */
  readonly isEmpty: boolean;
  /** For explicit ordered items (`1.`) the parsed number; `null` otherwise. */
  readonly ordinal: number | null;
}

// Checklist: a `*`-run or `-` bullet, then ` [ ]`/`[x]`/`[X]`. Trailing ` content` is optional
// so a checkbox-only line (`* [ ]`) is recognized as the empty item. Tried before plain
// unordered/dash (they share the `*`/`-` prefix).
const CHECKLIST_RE = /^([ \t]*)(\*+|-) \[([ xX])\]( .*)?$/;
// Unordered: leading indent, then `*`-run or a single `-`, then a required space.
const UNORDERED_RE = /^([ \t]*)(\*+|-) (.*)$/;
// Ordered explicit: digits + `.` + required space (e.g. `1. `, `12. `).
const ORDERED_EXPLICIT_RE = /^([ \t]*)(\d+)\. (.*)$/;
// Ordered implicit: a `.`-run + required space (`.... ` is depth-4; `....` alone is a literal block).
const ORDERED_IMPLICIT_RE = /^([ \t]*)(\.+) (.*)$/;
// Description separator-only line (the empty item produced by continuation; Enter exits it).
const DESCRIPTION_EMPTY_RE = /^([ \t]*)(:{2,4}|;;)\s*$/;
// Description term form: a single space-free term, then a `::`/`:::`/`::::`/`;;` separator, then
// EOL or a space + content. The term is `\S+?` (no whitespace) so ordinary prose that merely
// contains a mid-line `:: `/`;; ` is not mistaken for a description item, keeping continuation in
// lockstep with the tokenizer (which only highlights single-token terms). Requiring EOL-or-space
// after the separator also excludes block macros like `image::a[]`.
const DESCRIPTION_TERM_RE = /^([ \t]*)(\S+?)(:{2,4}|;;)( .*)?$/;

/**
 * Parses a single line of source into a {@link ListMarker}, or `null` when the line is not a
 * recognized list item.
 *
 * The marker families are tried in an order that avoids overlap (checklist before plain
 * unordered/dash, which share the `*`/`-` prefix; the term/separator-only description forms
 * last). A returned marker drives the Enter command's continue / exit decision; `null` lets the
 * command fall through to a plain newline.
 *
 * @param lineText - The full text of the current line (no trailing newline).
 * @returns The parsed marker descriptor, or `null` when the line is not a list item.
 */
export function parseListMarker(lineText: string): ListMarker | null {
  return (
    parseChecklist(lineText) ??
    parseUnordered(lineText) ??
    parseOrdered(lineText) ??
    parseDescription(lineText)
  );
}

/** Maps a description separator to its nesting level (`;;` is its own level; informational). */
function separatorDepth(separator: string): number {
  return separator === ';;' ? 1 : separator.length;
}

/**
 * Recognizes description items: the separator-only line (`:: ` — the empty item Enter exits) is
 * tried first so a 4-colon separator isn't mis-split as `term=:` + `:::`; otherwise the term form
 * (`CPU:: …`, bare `CPU::`, `Term;; …`). A bare term is non-empty (it continues, D4).
 */
function parseDescription(lineText: string): ListMarker | null {
  const empty = DESCRIPTION_EMPTY_RE.exec(lineText);
  if (empty) {
    const [, indent, separator] = empty;
    return {
      kind: 'description',
      indent,
      marker: separator,
      depth: separatorDepth(separator),
      contentStart: indent.length + separator.length + 1,
      isEmpty: true,
      ordinal: null,
    };
  }
  const term = DESCRIPTION_TERM_RE.exec(lineText);
  if (term) {
    const [, indent, termText, separator, content] = term;
    return {
      kind: 'description',
      indent,
      marker: separator,
      depth: separatorDepth(separator),
      contentStart: indent.length + termText.length + separator.length + (content === undefined ? 0 : 1),
      isEmpty: false,
      ordinal: null,
    };
  }
  return null;
}

/** Recognizes `*`/`-` checklist items (`[ ]`/`[x]`/`[X]`); a checkbox-only line is empty. */
function parseChecklist(lineText: string): ListMarker | null {
  const match = CHECKLIST_RE.exec(lineText);
  if (!match) return null;
  const [, indent, marker, , content] = match;
  return {
    kind: 'checklist',
    indent,
    marker,
    depth: marker === '-' ? 1 : marker.length,
    // After the bullet, ` [x] ` is 5 characters.
    contentStart: indent.length + marker.length + 5,
    isEmpty: content === undefined || content.trim() === '',
    ordinal: null,
  };
}

/** Recognizes `*`/`**`/`-` bullets (each requiring a trailing space). */
function parseUnordered(lineText: string): ListMarker | null {
  const match = UNORDERED_RE.exec(lineText);
  if (!match) return null;
  const [, indent, marker, content] = match;
  const contentStart = indent.length + marker.length + 1;
  return {
    kind: 'unordered',
    indent,
    marker,
    depth: marker === '-' ? 1 : marker.length,
    contentStart,
    isEmpty: content.trim() === '',
    ordinal: null,
  };
}

/** Recognizes implicit `.`/`..` and explicit `1.`/`12.` ordered markers (each + a space). */
function parseOrdered(lineText: string): ListMarker | null {
  const explicit = ORDERED_EXPLICIT_RE.exec(lineText);
  if (explicit) {
    const [, indent, digits, content] = explicit;
    const marker = `${digits}.`;
    return {
      kind: 'ordered',
      indent,
      marker,
      depth: 1,
      contentStart: indent.length + marker.length + 1,
      isEmpty: content.trim() === '',
      ordinal: Number(digits),
    };
  }
  const implicit = ORDERED_IMPLICIT_RE.exec(lineText);
  if (implicit) {
    const [, indent, dots, content] = implicit;
    return {
      kind: 'ordered',
      indent,
      marker: dots,
      depth: dots.length,
      contentStart: indent.length + dots.length + 1,
      isEmpty: content.trim() === '',
      ordinal: null,
    };
  }
  return null;
}
