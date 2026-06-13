import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';

/**
 * Prose spell-check (US9, FR-063). Tree-aware: verbatim blocks, macros,
 * attribute names, URLs and other non-prose nodes are skipped so only prose is
 * checked. Words on a per-user ignore list are never flagged. The dictionary
 * (`nspell` + `dictionary-en`) loads lazily off the typing path.
 *
 * The tokenisation, skip-node predicate, and ignore filtering are pure and
 * unit-tested; the live `nspell` dictionary + lint wiring is exercised by e2e.
 */

/** Grammar node names whose text is NOT prose and must not be spell-checked. */
export const SPELLCHECK_SKIP_NODES = new Set([
  'ListingBlock', 'LiteralBlock', 'PassthroughBlock', 'CommentBlock', 'CommentLine',
  'StemBlock', 'Monospace', 'AttributeEntry', 'AttributeReference', 'BlockMacro',
  'InlineMacro', 'CrossReference', 'Footnote', 'Conditional', 'BlockAttributeLine',
  'DocumentTitle',
]);

const WORD_RE = /[A-Za-z][A-Za-z']*/g;

/** A prose word with its document offsets. */
export interface WordToken {
  /** The word text. */
  word: string;
  /** Document offset of the word start. */
  from: number;
  /** Document offset just past the word. */
  to: number;
}

/** Tokenise prose text into word tokens with absolute offsets (`base` = text start offset). */
export function tokenizeWords(text: string, base = 0): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const index = match.index ?? 0;
    tokens.push({ word: match[0], from: base + index, to: base + index + match[0].length });
  }
  return tokens;
}

/**
 * Select the misspelled tokens: not accepted by `isCorrect` and not in the
 * (case-insensitive) ignore set. Single-letter words are skipped.
 */
export function selectMisspelled(
  tokens: WordToken[],
  isCorrect: (word: string) => boolean,
  ignore: Iterable<string>,
): WordToken[] {
  const ignored = new Set([...ignore].map((word) => word.toLowerCase()));
  return tokens.filter(
    (token) => token.word.length > 1 && !ignored.has(token.word.toLowerCase()) && !isCorrect(token.word),
  );
}

/** A loaded spell checker: a synchronous correctness test plus a suggestion helper. */
export interface SpellChecker {
  /**
   * Whether a word is spelled correctly.
   *
   * @param word - The word to check.
   * @returns True when the word is in the dictionary.
   */
  correct: (word: string) => boolean;
  /**
   * Suggested corrections for a word.
   *
   * @param word - The (possibly misspelled) word.
   * @returns Up to a few suggested corrections.
   */
  suggest: (word: string) => string[];
}

let checkerPromise: Promise<SpellChecker | null> | null = null;

/** Lazily load the English dictionary into an nspell checker (best-effort, cached). */
export function loadSpellChecker(): Promise<SpellChecker | null> {
  checkerPromise ??= (async () => {
    try {
      const [{ default: nspell }, dictionaryModule] = await Promise.all([
        import('nspell'),
        import('dictionary-en'),
      ]);
      const dictionary = await resolveDictionary(dictionaryModule);
      if (!dictionary) return null;
      const speller = nspell(dictionary);
      return {
        correct: (word: string) => speller.correct(word),
        suggest: (word: string) => speller.suggest(word).slice(0, 5),
      };
    } catch {
      return null;
    }
  })();
  return checkerPromise;
}

interface AffDic {
  /** Hunspell affix rules. */
  aff: Buffer;
  /** Hunspell dictionary words. */
  dic: Buffer;
}

function isAffDic(value: unknown): value is AffDic {
  return typeof value === 'object' && value !== null && 'aff' in value && 'dic' in value;
}

/** `dictionary-en` ships either an async loader or `{ aff, dic }` buffers across versions. */
async function resolveDictionary(module: unknown): Promise<AffDic | null> {
  const candidate =
    typeof module === 'object' && module !== null && 'default' in module ? module.default : module;
  if (typeof candidate === 'function') {
    return new Promise((resolve) => {
      candidate((error: unknown, dict: unknown) => resolve(error || !isAffDic(dict) ? null : dict));
    });
  }
  return isAffDic(candidate) ? candidate : null;
}

/**
 * Async `@codemirror/lint` source flagging misspelled prose words as info
 * diagnostics, with "Add to dictionary" handled by the host via `getIgnore`.
 */
export function asciidocSpellcheckSource(getIgnore: () => Iterable<string>) {
  return async (view: EditorView): Promise<Diagnostic[]> => {
    const checker = await loadSpellChecker();
    if (!checker) return [];
    const tree = syntaxTree(view.state);
    const diagnostics: Diagnostic[] = [];
    const text = view.state.doc.toString();

    // Collect prose ranges by subtracting skip-node ranges from the document.
    const skip: Array<{ from: number; to: number }> = [];
    tree.cursor().iterate((node) => {
      if (SPELLCHECK_SKIP_NODES.has(node.name)) skip.push({ from: node.from, to: node.to });
    });
    const isSkipped = (from: number, to: number) =>
      skip.some((range) => from >= range.from && to <= range.to);

    for (const token of selectMisspelled(tokenizeWords(text), checker.correct, getIgnore())) {
      if (isSkipped(token.from, token.to)) continue;
      diagnostics.push({
        from: token.from,
        to: token.to,
        severity: 'info',
        message: `“${token.word}” may be misspelled`,
      });
    }
    return diagnostics;
  };
}
