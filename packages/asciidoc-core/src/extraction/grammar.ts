/**
 * The AsciiDoc token grammar for the extraction engine: every regular expression the structural
 * analysis matches against, in one place. Keeping the grammar centralized means a rule tweak happens
 * once and every concern (references, symbols, attribute resolution, include graph, level offset) sees
 * it consistently. The single copy shared by the server (`@asciidocollab/domain`) and the editor
 * (`apps/web`).
 */

export const XREF_RE = /<<([^,>\n<]+)(?:,[^>\n<]*)?>>|xref:((?:(?!xref:)[^[\n])+)\[/g;
// An include directive must occupy the WHOLE line (trailing whitespace only) to be processed by
// Asciidoctor — `include::x[] trailing` is a paragraph, not a directive. End-anchored so the symbol
// index, reference extraction, and offset/inheritance walks all agree with the preview assembler.
export const INCLUDE_RE = /^[ \t]*include::((?:(?!include::)[^[\n])+)\[((?:(?!include::)[^\]\n])*)\][ \t]*$/gm;
export const IMAGE_RE = /image::?((?:(?!image:)[^[\n])+)\[/g;
export const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
export const ANCHOR_RE = /\[\[([A-Za-z][\w:.-]*)\]\]|\[#([A-Za-z][\w:.-]*)\]|anchor:([A-Za-z](?:(?!anchor:)[\w:.-])*)\[/g;
export const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):/gm;
// Attribute definition WITH its value: `:name: value` (an unset `:name!:` does not match). Group 2
// captures the raw remainder of the line; the caller trims surrounding spaces/tabs. Capturing the
// whole tail (rather than a `[ \t]*(value)[ \t]*$` sandwich) keeps matching linear — the two
// whitespace runs around an optional value are a polynomial-ReDoS shape flagged by CodeQL.
export const ATTR_DEF_VALUE_RE = /^:([A-Za-z0-9][\w-]*):(.*)$/gm;
// A single attribute-entry LINE (anchored, not global): a set `:name: value`, a prefix unset
// `:!name:`, or a suffix unset `:name!:`. Group 1/3 = name (set / suffix-unset), group 2 = value,
// group 4 = prefix-unset name. Used by the line-scanning event builder so wrapping continuation
// (a trailing `\`) and unset can be handled, which the global value regex cannot express.
export const ATTR_ENTRY_LINE_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*([^ \t\n][^\n]*|)$|^:!([A-Za-z0-9][\w-]*):[ \t]*$|^:([A-Za-z0-9][\w-]*)!:[ \t]*$/;
// Inline attribute assignment in body text: `{set:name:value}` (set) or `{set:name!}` (unset).
export const INLINE_SET_RE = /\{set:([A-Za-z0-9][\w-]*)(?:!|:([^{}]*))\}/g;
// A soft-set precedence marker: a value ending in `@` is an overridable default (Asciidoctor
// soft-set), so it must NOT clobber an attribute already in scope. The marker is stripped.
export const SOFT_SET_SUFFIX = '@';
// A trailing `\` (after optional whitespace) continues an attribute value on the next line.
export const VALUE_CONTINUATION_RE = /\\[ \t]*$/;
// Partial-include selectors in an include directive's attribute list: `tags=`/`tag=` and `lines=`.
// The value may be quoted; tokens are separated by `;` or `,`.
export const INCLUDE_TAGS_RE = /\btags?\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\]]+))/;
export const INCLUDE_LINES_RE = /\blines\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\]]+))/;
export const SELECTOR_SEPARATOR_RE = /[;,]/;
// Group 2 starts at the first non-space (`\S`) so the `\s+` separator and the title do not overlap
// on the space character — `\s+(.+)` is a polynomial-ReDoS shape (both match ' ') that CodeQL flags;
// `\s+(\S.*)` is linear and, since `\s+` is greedy, captures the identical title.
export const HEADING_RE = /^(={1,6})\s+(\S.*)$/gm;
// An explicit block id (`[#id]` or `[[id]]`) on its own line. When it sits
// immediately above a heading it overrides the auto-generated section id.
export const SECTION_ID_ATTR_RE = /^[ \t]*\[(?:#([A-Za-z][\w:.-]*)|\[([A-Za-z][\w:.-]*)\])\][ \t]*$/;
// A `==`-line is only a section title at a block boundary. Plain prose opens a paragraph that
// absorbs every following non-blank line until a blank line, so `prose\n== Foo` is paragraph text,
// not a heading. A blank line, a closing delimited block, or a single-line block construct keeps the
// next line at a boundary.
export const DELIMITER_LINE_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,}|={4,}|\*{4,}|_{4,}|--|\|===|,===|:===)$/;
export const BOUNDARY_CONSTRUCT_RE = /^(?::[A-Za-z0-9][\w-]*!?:|\[.+\]$|\.[^\s.[]|\/\/|[A-Za-z0-9_-]+::\S)/;
// Verbatim/comment delimited-block fences whose bodies are NOT subject to xref/attribute/macro
// substitution: listing (`----`), literal (`....`), passthrough (`++++`), and comment (`////`).
// Example/sidebar/quote/open blocks DO substitute, so they are deliberately excluded here. The
// fence must begin at column 0 (only trailing whitespace allowed) — Asciidoctor does not treat an
// INDENTED run as a delimiter, so matching a trimmed line would mask real references after stray
// indented content. Capture group 1 is the delimiter token (length-sensitive close matching).
export const VERBATIM_FENCE_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,})[ \t]*$/;
// An attribute-form `:leveloffset:` entry: a relative `+N`/`-N` shift, an absolute `N` set, or an
// unset that returns to the base. Asciidoctor unsets an attribute with EITHER the prefix form
// (`:!leveloffset:`, group 1) or the suffix form (`:leveloffset!:`, group 2); an empty value (group 3)
// is also a reset. Mirrors the document-order `ATTR_ENTRY_LINE_RE` unset handling so the assembler's
// inlined offset tracking agrees with the resolution layer's event-based walk for both unset forms.
export const LEVELOFFSET_ENTRY_RE = /^:(!?)leveloffset(!?):[ \t]*([^ \t\n][^\n]*|)$/;
