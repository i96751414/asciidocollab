import { parseMixed, type Input, type NestedParse, type Parser, type SyntaxNodeRef } from '@lezer/common';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { canonicalSourceLanguageName, resolveSourceLanguage } from './source-languages';

/**
 * In-editor source-language highlighting (US5, FR-017–019). The body of a
 * `[source,<lang>]` listing block is parsed by the embedded language's parser
 * via `parseMixed`; unknown/absent languages get no injection (plain text) and
 * AsciiDoc highlighting resumes after the block. Embedded code is inert data —
 * never executed (Constitution VI/IX).
 *
 * Languages load lazily from the curated allow-list. The wrap reads a synchronous
 * loaded-parser cache; the loader plugin populates it and reconfigures the
 * language compartment so the block re-parses once its language is available.
 */

/** Canonical language name → loaded embedded parser. */
const loadedParsers = new Map<string, Parser>();
const loadingLanguages = new Set<string>();

const SOURCE_DECL_RE = /^\s*\[source\s*,\s*([\w+#.-]+)/i;

/** Extract and resolve the language of a `[source,<lang>]` declaration line, or null. */
export function extractSourceLanguage(line: string): string | null {
  const match = SOURCE_DECL_RE.exec(line);
  return match ? canonicalSourceLanguageName(match[1]) : null;
}

/** Distinct resolved source languages declared anywhere in the document. */
export function collectSourceLanguages(documentText: string): string[] {
  const languages = new Set<string>();
  for (const line of documentText.split('\n')) {
    const language = extractSourceLanguage(line);
    if (language) languages.add(language);
  }
  return [...languages];
}

/** Find the resolved language for a listing block by scanning back to its `[source,..]` decl. */
function languageForBlock(input: Input, blockFrom: number): string | null {
  const windowStart = Math.max(0, blockFrom - 400);
  const preceding = input.read(windowStart, blockFrom).split('\n');
  for (let index = preceding.length - 1; index >= 0; index--) {
    const trimmed = preceding[index].trim();
    if (trimmed === '') continue;
    const language = extractSourceLanguage(preceding[index]);
    if (language) return language;
    // Only a block title (`.Foo`) or another attribute line (`[..]`) may sit between
    // the source declaration and the delimiter; anything else ends the search.
    if (!trimmed.startsWith('.') && !trimmed.startsWith('[')) return null;
  }
  return null;
}

/** Mixed-language wrap that injects the embedded language parser into source-block bodies. */
export const sourceMixedWrap = parseMixed((node: SyntaxNodeRef, input: Input): NestedParse | null => {
  if (node.name !== 'ListingBlock' && node.name !== 'LiteralBlock') return null;
  const language = languageForBlock(input, node.from);
  if (!language) return null;
  const parser = loadedParsers.get(language);
  if (!parser) return null;

  const open = node.node.firstChild;
  const close = node.node.lastChild;
  if (!open || !close || open === close) return null;
  const from = open.to;
  const to = close.from;
  if (from >= to) return null;
  return { parser, overlay: [{ from, to }] };
});

/**
 * Loader extension: lazily loads the languages declared in the document and, once
 * a new one is ready, calls `reparse(view)` so the block re-highlights. `reparse`
 * is supplied by the mount (it reconfigures the language compartment).
 */
export function asciidocSourceHighlight(reparse: (view: EditorView) => void): Extension {
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        this.ensureLoaded(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.ensureLoaded(update.view);
      }

      ensureLoaded(view: EditorView) {
        for (const language of collectSourceLanguages(view.state.doc.toString())) {
          if (loadedParsers.has(language) || loadingLanguages.has(language)) continue;
          const description = resolveSourceLanguage(language);
          if (!description) continue;
          loadingLanguages.add(language);
          description
            .load()
            .then((support) => {
              loadedParsers.set(language, support.language.parser);
              loadingLanguages.delete(language);
              // The async import may resolve after the user switched files (remount)
              // or closed the editor; dispatching to a destroyed view throws. The
              // parser is cached module-wide, so a live view re-highlights on its own.
              if (view.dom.isConnected) reparse(view);
            })
            .catch(() => loadingLanguages.delete(language));
        }
      }
    },
  );
}
