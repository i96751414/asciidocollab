/**
 * Markdown-subset → AsciiDoc mapper.
 *
 * Paste-HTML support converts HTML → Markdown with the reused `turndown`
 * library, then this small first-party mapper converts that Markdown subset to
 * AsciiDoc. No maintained HTML→AsciiDoc asset exists to vendor, so this narrow
 * mapper is permitted under the clarified Constitution IV.
 *
 * Supported subset: ATX headings, ordered/unordered (including nested) lists,
 * bold/italic, inline code, links, fenced code blocks (→ `[source]`), and GFM
 * pipe tables (→ `|===`). Anything outside the subset is passed through as-is.
 *
 * Pure and dependency-free so it is unit-testable in isolation.
 */

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const UNORDERED_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)\s*([\w+#-]*)\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Convert one line's inline Markdown markup to AsciiDoc. */
export function convertInlineMarkdown(text: string): string {
  let out = text;

  // Links: [label](url) → url[label] (bare URL) or link:url[label] (relative).
  out = out.replaceAll(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) =>
    /^(https?|ftp|irc|mailto):/i.test(url) ? `${url}[${label}]` : `link:${url}[${label}]`,
  );

  // Italic *text* (single asterisk, not part of **) → _text_.
  out = out.replaceAll(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, '_$1_');

  // Bold **text** / __text__ → *text*.
  out = out.replaceAll(/\*\*([^*\n]+?)\*\*/g, '*$1*');
  out = out.replaceAll(/__([^_\n]+?)__/g, '*$1*');

  return out;
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') || /\S\s*\|\s*\S/.test(line);
}

/** Convert a Markdown subset to AsciiDoc. */
export function markdownSubsetToAsciidoc(markdown: string): string {
  const lines = markdown.replaceAll(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let index = 0;
  let inFence = false;
  let fenceMarker = '';

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code block → [source,<lang>] + ---- delimiters; body is verbatim.
    const fence = line.match(FENCE_RE);
    if (fence && !inFence) {
      inFence = true;
      fenceMarker = fence[1];
      const language = canonicalFenceLanguage(fence[2]);
      if (language) out.push(`[source,${language}]`);
      out.push('----');
      index += 1;
      continue;
    }
    if (inFence) {
      // A closing fence is a run of the opener's fence char, length ≥ the opener
      // (GFM allows a longer closing fence), with only trailing whitespace.
      const trimmedLine = line.trim();
      const closes =
        trimmedLine.length >= fenceMarker.length && [...trimmedLine].every((char) => char === fenceMarker[0]);
      if (closes) {
        inFence = false;
        out.push('----');
      } else {
        out.push(line);
      }
      index += 1;
      continue;
    }

    // GFM pipe table: a row followed by a separator row. The separator MUST
    // contain a pipe, so a bare `---` thematic break is not mistaken for one.
    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      lines[index + 1].includes('|') &&
      TABLE_SEPARATOR_RE.test(lines[index + 1])
    ) {
      const headerCells = splitRow(line);
      out.push('|===', headerCells.map((cell) => `| ${convertInlineMarkdown(cell)}`).join(' '), '');
      index += 2; // skip header + separator
      while (index < lines.length && isTableRow(lines[index]) && lines[index].trim() !== '') {
        const cells = splitRow(lines[index]);
        out.push(cells.map((cell) => `| ${convertInlineMarkdown(cell)}`).join(' '));
        index += 1;
      }
      out.push('|===');
      continue;
    }

    // ATX heading.
    const heading = line.match(HEADING_RE);
    if (heading) {
      out.push(`${'='.repeat(heading[1].length)} ${convertInlineMarkdown(heading[2])}`);
      index += 1;
      continue;
    }

    // Lists (depth from indentation; 2 spaces per level).
    const unordered = line.match(UNORDERED_RE);
    if (unordered) {
      const depth = Math.floor(unordered[1].replaceAll('\t', '  ').length / 2);
      out.push(`${'*'.repeat(depth + 1)} ${convertInlineMarkdown(unordered[2])}`);
      index += 1;
      continue;
    }
    const ordered = line.match(ORDERED_RE);
    if (ordered) {
      const depth = Math.floor(ordered[1].replaceAll('\t', '  ').length / 2);
      out.push(`${'.'.repeat(depth + 1)} ${convertInlineMarkdown(ordered[2])}`);
      index += 1;
      continue;
    }

    // Plain text / blank lines.
    out.push(convertInlineMarkdown(line));
    index += 1;
  }

  return out.join('\n');
}

/**
 * Resolve a fenced-code language token to a canonical AsciiDoc source language.
 * Kept local (lowercase passthrough) to avoid coupling the pure mapper to the
 * editor's `@codemirror/language-data` allow-list; an unknown token yields the
 * raw token so the `[source,<lang>]` line still records the author's intent.
 */
function canonicalFenceLanguage(token: string): string | null {
  const trimmed = token.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
