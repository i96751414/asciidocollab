/**
 * AsciiDoCollab CodeMirror 6 editor theme covering both the editor chrome and
 * the syntax highlighting. Colours are read from the `--background`, `--primary`
 * and `--syntax-*` CSS variables in globals.css, so the editor follows the app's
 * light and dark themes automatically with no JavaScript switching. Add the
 * exported `asciidocTheme` to your editor's extensions array to apply it.
 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Builds an `hsl(var(--name))` colour string, optionally with an alpha value. */
const c = (name: string, alpha?: number) =>
  alpha === undefined ? `hsl(var(${name}))` : `hsl(var(${name}) / ${alpha})`;

/** Chrome: editor surface, gutters, cursor, selection, active line. */
export const asciidocEditorTheme = EditorView.theme({
  "&": {
    color: c("--foreground"),
    backgroundColor: c("--background"),
  },
  ".cm-content": {
    fontFamily:
      "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
    caretColor: c("--primary"),
    padding: "8px 0",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: c("--primary"), borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: c("--primary", 0.18),
  },
  ".cm-selectionMatch": { backgroundColor: c("--primary", 0.16) },
  ".cm-gutters": {
    backgroundColor: c("--background"),
    color: c("--syntax-punct"),
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: c("--accent", 0.45) },
  ".cm-activeLineGutter": { backgroundColor: c("--accent", 0.55), color: c("--foreground") },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 8px" },
  ".cm-foldPlaceholder": {
    backgroundColor: c("--muted"),
    color: c("--muted-foreground"),
    border: "none",
    padding: "0 6px",
    borderRadius: "4px",
  },
  ".cm-tooltip": {
    backgroundColor: c("--popover"),
    color: c("--popover-foreground"),
    border: `1px solid ${c("--border")}`,
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: c("--accent"),
    color: c("--accent-foreground"),
  },
  // Effective heading-level styling (US3) — sizes a heading line by its effective
  // level (raw + :leveloffset:), so a shifted heading visually matches its level.
  ".cm-ad-h0": { fontSize: "1.6em", fontWeight: "700" },
  ".cm-ad-h1": { fontSize: "1.45em", fontWeight: "700" },
  ".cm-ad-h2": { fontSize: "1.3em", fontWeight: "600" },
  ".cm-ad-h3": { fontSize: "1.17em", fontWeight: "600" },
  ".cm-ad-h4": { fontSize: "1.08em", fontWeight: "600" },
  ".cm-ad-h5": { fontSize: "1em", fontWeight: "600" },
  // Discrete/float headings are styled as headings but render in a muted accent
  // to signal they are excluded from the document outline.
  ".cm-ad-discrete": { fontStyle: "italic", color: c("--syntax-keyword") },
  // Collapsed {attr} reference rendered as its resolved value (FR-057).
  ".cm-ad-attr-value": {
    color: c("--syntax-attr"),
    borderBottom: `1px dotted ${c("--syntax-attr")}`,
  },
  "&.cm-focused": { outline: "none" },
}, { dark: false });

/** Token colours — AsciiDoc markup + fenced source blocks. */
export const asciidocHighlightStyle = HighlightStyle.define([
  // Section titles (=, ==, ===)
  { tag: [t.heading, t.heading1], color: c("--syntax-heading"), fontWeight: "700" },
  { tag: [t.heading2, t.heading3, t.heading4], color: c("--syntax-heading"), fontWeight: "600" },
  // Inline emphasis
  { tag: t.strong, color: c("--foreground"), fontWeight: "700" },
  { tag: t.emphasis, color: c("--foreground"), fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  // Links / macros / cross-references
  { tag: [t.link, t.url], color: c("--syntax-link"), textDecoration: "underline" },
  // Document attributes & block metadata  (:toc:, [source,ruby], author line)
  { tag: [t.meta, t.attributeName, t.annotation, t.docComment, t.macroName], color: c("--syntax-attr") },
  // Admonition labels, list markers, structural keywords  (NOTE:, *, .)
  { tag: [t.keyword, t.labelName, t.processingInstruction], color: c("--syntax-keyword"), fontWeight: "600" },
  { tag: [t.list, t.quote], color: c("--syntax-link") },
  // Monospace / inline code / strings inside source blocks
  { tag: [t.monospace, t.literal], color: c("--syntax-string") },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: c("--syntax-string") },
  { tag: [t.number, t.bool, t.atom], color: c("--syntax-attr") },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: c("--syntax-link") },
  { tag: [t.typeName, t.className], color: c("--syntax-keyword") },
  // Source/listing block bodies render as plain readable code (foreground),
  // not dimmed like prose comments.
  { tag: t.content, color: c("--foreground") },
  // Comments & block delimiters (----, ////, //)
  { tag: [t.comment, t.lineComment, t.blockComment], color: c("--syntax-comment"), fontStyle: "italic" },
  { tag: [t.contentSeparator], color: c("--syntax-comment") },
  // Punctuation & typographic replacements/entities ((C), (R), &amp;)
  { tag: [t.punctuation, t.separator, t.operator, t.bracket, t.character], color: c("--syntax-punct") },
  { tag: t.invalid, color: c("--destructive") },
]);

/** Combined extension — add this to your editor's extensions array. */
export const asciidocTheme = [
  asciidocEditorTheme,
  syntaxHighlighting(asciidocHighlightStyle),
];

export default asciidocTheme;
