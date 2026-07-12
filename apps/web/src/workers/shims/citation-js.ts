/**
 * The citations shim: turns a document's BibTeX citation macros into formatted AsciiDoc, so the
 * client-side PDF pipeline can hand the result to the real Asciidoctor convert.
 *
 * Unlike the diagram/math shims (one inert block → one asset), the citations family is BATCH: the
 * citations pipeline stage hands the WHOLE assembled document as `input.source` and the raw `.bib`
 * plus optional CSL style / ordering mode in `input.params`. This shim parses the `.bib` ONCE, rewrites
 * every `cite:` / `citenp:` / `bibitem:` / `bibliography::` macro into formatted AsciiDoc (inline label
 * + a generated reference list with stable anchors and back-links), and returns the rewritten document
 * as UTF-8 AsciiDoc bytes — carried through the byte-oriented `ShimAsset` under `format:'svg'` (the
 * carrier the stage decodes as text; there is no image here).
 *
 * The `.bib` database and every macro are INERT DATA (Principle IX): parsed and formatted, never
 * executed. Citation-js runs entirely in-process with no network I/O. Any citation problem — an
 * unreadable `.bib`, an unknown citation key, an unsupported CSL style, a formatting failure — is
 * returned as a single `malformed-citation` diagnostic; this shim never throws across the boundary.
 *
 * Style + ordering parity with asciidoctor-bibtex (the highest-fidelity risk in this feature): the
 * visible citation label and each reference entry are produced by the CSL engine (citeproc, via
 * `@citation-js/plugin-csl`), so numeric-vs-author-date is decided by the chosen CSL style itself. The
 * ordering mode (`appearance` vs `alphabetical`) is realized by the single order in which keys are
 * registered with the engine: for numeric styles that order also fixes the assigned numbers, so the
 * inline labels and the reference list always agree.
 */

import { Cite, plugins } from '@citation-js/core';
import type {
  CiteprocEngine,
  CiteprocItem,
  CslEntry,
  CslPluginConfig,
} from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

import type {
  DiagnosticCode,
  RenderShim,
  ShimAssetFormat,
  ShimInput,
  ShimKind,
  ShimOutput,
} from '@asciidocollab/asciidoc-pdf';

// citation-js interop lives in `src/types/citation-js.d.ts` — the ONE place this app crosses into
// citation-js's untyped world (the `@citation-js/*` packages ship no type declarations). The value
// symbols (`Cite`, `plugins`) and the CSL/citeproc types (`CslEntry`, `CiteprocItem`, `CiteprocEngine`,
// `CslPluginConfig`) imported above are the entire typed surface this shim uses; no `any`/`as` escapes.

/**
 * Citation-js's `@citation-js/core` version. Read for the {@link RenderShim.version} field (part of the
 * client-side render-cache hash). Must be bumped in lockstep with the `@citation-js/core` dependency
 * declared in this package's `package.json`.
 */
const CITATION_JS_VERSION = '0.8.1';

// ---------------------------------------------------------------------------
// Shim identity, output format, diagnostic code (named — never bare literals).
// ---------------------------------------------------------------------------

/** This shim's family. */
const SHIM_KIND: ShimKind = 'citations';

/** The concrete engine name; also the key the citations stage resolves this shim by. */
const SHIM_NAME = 'citation-js';

/** The carrier format. Citations emit AsciiDoc text, not an image; the stage decodes the bytes as text. */
const CARRIER_FORMAT: ShimAssetFormat = 'svg';

/** The diagnostic returned for any unusable `.bib`, unknown key, unknown style, or formatting failure. */
const MALFORMED_CITATION: DiagnosticCode = 'malformed-citation';

// ---------------------------------------------------------------------------
// Render params (set by the citations pipeline stage) this shim reads.
// ---------------------------------------------------------------------------

/** Param carrying the whole `.bib` database text (parsed once per render). */
export const BIBTEX_DATABASE_PARAM = 'bibtex';

/** Param naming the CSL style to format with (numeric-vs-author-date follows from the style). */
export const BIBTEX_STYLE_PARAM = 'bibtex-style';

/** Param selecting the reference-list ordering: appearance vs alphabetical. */
export const BIBTEX_ORDER_PARAM = 'bibtex-order';

// ---------------------------------------------------------------------------
// Formatting configuration.
// ---------------------------------------------------------------------------

/** Default CSL style when the project sets none — an author-date style bundled with the CSL plugin. */
const DEFAULT_STYLE = 'apa';

/** The CSL locale; fixed for determinism (no ambient locale dependence). */
const CSL_LOCALE = 'en-US';

/** The citeproc output format this shim consumes (plain text, embedded into AsciiDoc). */
const CSL_TEXT_FORMAT = 'text';

/** Reference-list ordering modes. */
const ORDER_APPEARANCE = 'appearance';
const ORDER_ALPHABETICAL = 'alphabetical';

/** Default ordering: appearance (first-citation order), matching the natural reading order. */
const DEFAULT_ORDER = ORDER_APPEARANCE;

/** The sentinel citeproc emits for an author-only request against a style that prints no author. */
const NO_PRINTED_FORM = '[NO_PRINTED_FORM]';

// ---------------------------------------------------------------------------
// Macro names + rewrite anchors (named — never bare literals).
// ---------------------------------------------------------------------------

const CITE_MACRO = 'cite';
const CITENP_MACRO = 'citenp';
const BIBITEM_MACRO = 'bibitem';
const BIBLIOGRAPHY_MACRO = 'bibliography';

/** Anchor id prefix for a reference-list entry; also the cross-reference target for inline citations. */
const BIBREF_ANCHOR_PREFIX = 'bibref-';

/** Anchor id prefix for one citation occurrence; the reference entry back-links to these. */
const OCCURRENCE_ANCHOR_PREFIX = '_adc_citeref_';

/** The back-link glyph shown on each reference-entry return link. */
const BACKLINK_GLYPH = '↑';

/** Separator between comma-separated keys inside a macro target (`cite:a,b[]`). */
const KEY_SEPARATOR = ',';

/** Citeproc locator label used when a macro supplies a locator in its attribute list. */
const LOCATOR_LABEL = 'page';

// Inline macros: `name:keys[attrs]`. `citenp` is listed before `cite` so it wins the alternation.
const CITATION_MACRO_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(${CITENP_MACRO}|${CITE_MACRO}):([^\s\[\]]+)\[([^\]]*)\]`,
  'g',
);
const BIBITEM_MACRO_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9_])${BIBITEM_MACRO}:([^\s\[\]]+)\[([^\]]*)\]`,
  'g',
);
// Block macro on its own line: `bibliography::[...]` (optionally with a target before the brackets).
const BIBLIOGRAPHY_MACRO_PATTERN = new RegExp(
  String.raw`^[ \t]*${BIBLIOGRAPHY_MACRO}::[^\[\n]*\[[^\]]*\][ \t]*$`,
  'm',
);

/** Strips a leading numeric label (`"1. "`) so a standalone `bibitem` reads as prose, not a list item. */
const LEADING_NUMBER_LABEL = /^\d+\.\s*/;

// ---------------------------------------------------------------------------
// Diagnostics.
// ---------------------------------------------------------------------------

/** A citation problem carrying a message for the `malformed-citation` diagnostic. Never escapes render. */
class CitationError extends Error {}

function malformed(message: string): ShimOutput {
  return { ok: false, diagnostic: { code: MALFORMED_CITATION, message } };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Anchor / cross-reference helpers.
// ---------------------------------------------------------------------------

/** AsciiDoc anchor ids allow only word characters; fold anything else so ids stay valid and stable. */
function sanitizeKey(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

function bibAnchorId(key: string): string {
  return `${BIBREF_ANCHOR_PREFIX}${sanitizeKey(key)}`;
}

function occurrenceAnchorId(index: number): string {
  return `${OCCURRENCE_ANCHOR_PREFIX}${index}`;
}

/** An inline AsciiDoc anchor macro placed at a point in the text. */
function anchor(id: string): string {
  return `anchor:${id}[]`;
}

/** An inline AsciiDoc cross-reference with explicit link text. */
function xref(targetId: string, text: string): string {
  return `<<${targetId},${text}>>`;
}

// ---------------------------------------------------------------------------
// Alphabetical sort key (derived from the CSL record).
// ---------------------------------------------------------------------------

function firstYear(entry: CslEntry): number {
  return entry.issued?.['date-parts']?.[0]?.[0] ?? 0;
}

function alphabeticalSortKey(entry: CslEntry): string {
  const first = entry.author?.[0];
  const name = first?.family ?? first?.literal ?? first?.given ?? entry.title ?? entry.id;
  const year = String(firstYear(entry)).padStart(6, '0');
  return `${name.toLowerCase()} ${year} ${(entry.title ?? '').toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Macro parsing.
// ---------------------------------------------------------------------------

/** One parsed cite/citenp occurrence, in document order. */
interface CitationOccurrence {
  readonly narrative: boolean;
  readonly keys: readonly string[];
  readonly locator: string;
}

function parseKeys(raw: string, available: ReadonlySet<string>): string[] {
  const keys = raw.split(KEY_SEPARATOR).map((key) => key.trim()).filter((key) => key.length > 0);
  for (const key of keys) {
    if (!available.has(key)) {
      throw new CitationError(`Unknown citation key "${key}".`);
    }
  }
  return keys;
}

/** Collect every cite/citenp occurrence in document order, validating keys against the database. */
function collectOccurrences(document: string, available: ReadonlySet<string>): CitationOccurrence[] {
  const occurrences: CitationOccurrence[] = [];
  for (const match of document.matchAll(CITATION_MACRO_PATTERN)) {
    const [, macro, rawKeys, locator] = match;
    occurrences.push({
      narrative: macro === CITENP_MACRO,
      keys: parseKeys(rawKeys, available),
      locator: locator.trim(),
    });
  }
  return occurrences;
}

// ---------------------------------------------------------------------------
// Label formatting (delegated to the CSL engine).
// ---------------------------------------------------------------------------

function citeItems(occurrence: CitationOccurrence): CiteprocItem[] {
  const single = occurrence.keys.length === 1 && occurrence.locator.length > 0;
  return occurrence.keys.map((id) =>
    single ? { id, locator: occurrence.locator, label: LOCATOR_LABEL } : { id },
  );
}

/** The visible citation label: the CSL cluster for `cite`, an author-outside form for `citenp`. */
function formatLabel(engine: CiteprocEngine, occurrence: CitationOccurrence): string {
  const plain = engine.makeCitationCluster(citeItems(occurrence));
  if (!occurrence.narrative || occurrence.keys.length !== 1) {
    return plain;
  }
  const [id] = occurrence.keys;
  const author = engine.makeCitationCluster([{ id, 'author-only': true }]);
  // Numeric styles print no author → keep the plain numeric label (matches asciidoctor-bibtex).
  if (author.length === 0 || author.includes(NO_PRINTED_FORM)) {
    return plain;
  }
  const yearItem: CiteprocItem =
    occurrence.locator.length > 0
      ? { id, 'suppress-author': true, locator: occurrence.locator, label: LOCATOR_LABEL }
      : { id, 'suppress-author': true };
  const year = engine.makeCitationCluster([yearItem]);
  return `${author} ${year}`;
}

// ---------------------------------------------------------------------------
// Reference-list assembly.
// ---------------------------------------------------------------------------

/** The formatted reference entries: each key's citeproc text, plus the order the engine emits them in. */
interface FormattedEntries {
  /** Key → citeproc-formatted reference text. */
  readonly byKey: ReadonlyMap<string, string>;
  /** The keys in the order citeproc lays the bibliography out — the CSL style's own sort order. */
  readonly displayOrder: readonly string[];
}

/**
 * Format the reference entries and capture the order the CSL engine emits them in. The registration
 * order (`orderedKeys`) fixes the numbers a numeric style assigns; the *display* order, however, is the
 * style's own bibliography sort — citation-number order for a numeric style, alphabetical for an
 * author-date style — which is what asciidoctor-bibtex prints. Using the engine's emitted order (rather
 * than the registration order) keeps the reference list consistent with the reference build for BOTH
 * families, including an author-date style under appearance ordering (whose list stays alphabetical).
 */
function formatEntries(engine: CiteprocEngine, orderedKeys: readonly string[]): FormattedEntries {
  engine.updateItems([...orderedKeys]);
  const [meta, entries] = engine.makeBibliography();
  const byKey = new Map<string, string>();
  const displayOrder: string[] = [];
  for (const [index, ids] of meta.entry_ids.entries()) {
    const text = entries[index]?.trim() ?? '';
    for (const id of ids) {
      byKey.set(id, text);
      displayOrder.push(id);
    }
  }
  return { byKey, displayOrder };
}

/** Build the reference list block: each entry gets its anchor, formatted text, and occurrence back-links. */
function buildReferenceList(
  orderedKeys: readonly string[],
  entryText: ReadonlyMap<string, string>,
  backlinks: ReadonlyMap<string, number[]>,
): string {
  const paragraphs = orderedKeys.map((key) => {
    const links = (backlinks.get(key) ?? [])
      .map((index) => xref(occurrenceAnchorId(index), BACKLINK_GLYPH))
      .join(' ');
    const text = entryText.get(key) ?? '';
    const tail = links.length > 0 ? ` ${links}` : '';
    return `${anchor(bibAnchorId(key))} ${text}${tail}`;
  });
  return paragraphs.join('\n\n');
}

// ---------------------------------------------------------------------------
// Document rewrite.
// ---------------------------------------------------------------------------

function resolveStyle(config: CslPluginConfig, parameters: Readonly<Record<string, string>>): string {
  const style = parameters[BIBTEX_STYLE_PARAM] ?? DEFAULT_STYLE;
  if (!config.styles.has(style)) {
    throw new CitationError(`Unsupported CSL style "${style}".`);
  }
  return style;
}

function resolveOrderedKeys(
  mode: string,
  appearanceOrder: readonly string[],
  entriesById: ReadonlyMap<string, CslEntry>,
): string[] {
  if (mode === ORDER_ALPHABETICAL) {
    return appearanceOrder.toSorted((a, b) => {
      const left = entriesById.get(a);
      const right = entriesById.get(b);
      if (left === undefined || right === undefined) {
        return a.localeCompare(b);
      }
      return alphabeticalSortKey(left).localeCompare(alphabeticalSortKey(right));
    });
  }
  return [...appearanceOrder];
}

/** Rewrite every citation macro in the document; throws {@link CitationError} on any citation problem. */
function rewriteDocument(document: string, parameters: Readonly<Record<string, string>>): string {
  const config = plugins.config.get('@csl');
  const style = resolveStyle(config, parameters);
  const order = parameters[BIBTEX_ORDER_PARAM] ?? DEFAULT_ORDER;

  const database = parameters[BIBTEX_DATABASE_PARAM] ?? '';
  const entries = parseDatabase(database);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const available = new Set(entriesById.keys());

  const occurrences = collectOccurrences(document, available);

  // First-appearance order of the keys used by cite/citenp; drives the appearance ordering mode.
  const appearanceOrder: string[] = [];
  const seen = new Set<string>();
  const backlinks = new Map<string, number[]>();
  for (const [position, occurrence] of occurrences.entries()) {
    const occurrenceIndex = position + 1;
    for (const key of occurrence.keys) {
      if (!seen.has(key)) {
        seen.add(key);
        appearanceOrder.push(key);
      }
      const list = backlinks.get(key) ?? [];
      list.push(occurrenceIndex);
      backlinks.set(key, list);
    }
  }

  const orderedKeys = resolveOrderedKeys(order, appearanceOrder, entriesById);

  // One engine drives BOTH the inline labels and the reference list, so numeric numbers agree.
  const citationEngine = config.engine(entries, style, CSL_LOCALE, CSL_TEXT_FORMAT);
  const { byKey: entryText, displayOrder } = formatEntries(citationEngine, orderedKeys);

  const inlineReplacements = occurrences.map((occurrence, position) => {
    const occurrenceIndex = position + 1;
    const label = formatLabel(citationEngine, occurrence);
    const target = bibAnchorId(occurrence.keys[0]);
    return `${anchor(occurrenceAnchorId(occurrenceIndex))}${xref(target, label)}`;
  });

  let cursor = 0;
  let rewritten = document.replaceAll(CITATION_MACRO_PATTERN, () => inlineReplacements[cursor++]);

  rewritten = rewriteBibitems(rewritten, config, style, entries, available);

  const referenceList = buildReferenceList(displayOrder, entryText, backlinks);
  return placeReferenceList(rewritten, referenceList, displayOrder.length > 0);
}

/** Parse the `.bib` once; an unreadable database surfaces as a {@link CitationError}. */
function parseDatabase(database: string): CslEntry[] {
  try {
    return new Cite(database).get();
  } catch (error) {
    throw new CitationError(`BibTeX database could not be parsed: ${messageOf(error)}`);
  }
}

/** Rewrite `bibitem:key[]` into a standalone inline reference (its own engine; no shared numbering). */
function rewriteBibitems(
  document: string,
  config: CslPluginConfig,
  style: string,
  entries: readonly CslEntry[],
  available: ReadonlySet<string>,
): string {
  const keys: string[] = [];
  for (const match of document.matchAll(BIBITEM_MACRO_PATTERN)) {
    const key = match[1].trim();
    if (!available.has(key)) {
      throw new CitationError(`Unknown citation key "${key}".`);
    }
    keys.push(key);
  }
  if (keys.length === 0) {
    return document;
  }
  const engine = config.engine(entries, style, CSL_LOCALE, CSL_TEXT_FORMAT);
  const { byKey: entryText } = formatEntries(engine, keys);
  return document.replaceAll(BIBITEM_MACRO_PATTERN, (_full, rawKey: string) => {
    const text = entryText.get(rawKey.trim()) ?? '';
    return text.replace(LEADING_NUMBER_LABEL, '');
  });
}

/** Put the generated reference list where `bibliography::[]` sits, or append it when there is none. */
function placeReferenceList(document: string, referenceList: string, hasReferences: boolean): string {
  if (BIBLIOGRAPHY_MACRO_PATTERN.test(document)) {
    return document.replace(BIBLIOGRAPHY_MACRO_PATTERN, () => referenceList);
  }
  if (!hasReferences) {
    return document;
  }
  return `${document}\n\n${referenceList}`;
}

// ---------------------------------------------------------------------------
// The shim.
// ---------------------------------------------------------------------------

function render(input: ShimInput): ShimOutput {
  try {
    const rewritten = rewriteDocument(input.source, input.params);
    return {
      ok: true,
      asset: { format: CARRIER_FORMAT, bytes: new TextEncoder().encode(rewritten), rasterFallback: false },
    };
  } catch (error) {
    return malformed(messageOf(error));
  }
}

/**
 * Build the citation-js citations {@link RenderShim}. The BibTeX + CSL plugins are registered once at
 * module load (their side-effect imports above); each render parses the `.bib` a single time.
 */
export function createCitationJsShim(): RenderShim {
  return {
    kind: SHIM_KIND,
    name: SHIM_NAME,
    version: CITATION_JS_VERSION,
    render: (input) => Promise.resolve(render(input)),
  };
}
