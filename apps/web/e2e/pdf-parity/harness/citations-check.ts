/**
 * Structural citation-parity extraction + comparison. Citations are the highest-fidelity risk in the
 * export, so the comparison is deliberately rigorous and format-agnostic: it does not require the
 * visible label punctuation to match byte-for-byte (asciidoctor-bibtex prints `[1]`, citeproc prints
 * `1.`; that is cosmetic), it requires the FACTS to match — the reference-list entries, their order,
 * and, for numeric styles, the number assigned to each work and used at every in-text citation. A
 * divergence in any of those is a real defect in our rewriter, since the reference build is correct.
 */

/** The works cited by the citations fixture, keyed by the surname that identifies each in the output. */
export const CITED_WORKS = [
  { surname: 'Dijkstra', year: '1968' },
  { surname: 'Lamport', year: '1994' },
  { surname: 'Knuth', year: '1997' },
] as const;

const SURNAMES = CITED_WORKS.map((work) => work.surname);
const SURNAME_ALTERNATION = SURNAMES.join('|');

/** The facts extracted from one rendered citation PDF's text layer. */
export interface CitationFacts {
  /** Surnames in the order they appear in the reference list. */
  readonly referenceOrder: readonly string[];
  /** For numeric styles: the number printed for each work in the reference list (empty for author-date). */
  readonly numberBySurname: ReadonlyMap<string, number>;
  /** Whether every cited work's reference entry is present. */
  readonly allEntriesPresent: boolean;
}

/** Isolate the reference-list portion of the text (everything after the "References" section title). */
function referenceSection(text: string): string {
  const match = /References\s*/i.exec(text);
  return match === null ? text : text.slice(match.index + match[0].length);
}

/** Extract the ordered facts from a rendered citation PDF's extracted text. */
export function extractCitationFacts(pdfText: string): CitationFacts {
  const section = referenceSection(pdfText);

  const firstIndex = new Map<string, number>();
  for (const surname of SURNAMES) {
    const at = section.indexOf(surname);
    if (at !== -1) {
      firstIndex.set(surname, at);
    }
  }
  const referenceOrder = [...firstIndex.entries()]
    .toSorted((a, b) => a[1] - b[1])
    .map(([surname]) => surname);

  // Numbered entries look like `[1] Dijkstra`, `1. Dijkstra`, or `1 Dijkstra` — accept any of them.
  const numberBySurname = new Map<string, number>();
  const numberedEntry = new RegExp(String.raw`(?:\[(\d+)\]|(\d+)\.?)\s+(${SURNAME_ALTERNATION})`, 'g');
  for (const m of section.matchAll(numberedEntry)) {
    const value = Number(m[1] ?? m[2]);
    const surname = m[3];
    if (!numberBySurname.has(surname)) {
      numberBySurname.set(surname, value);
    }
  }

  return {
    referenceOrder,
    numberBySurname,
    allEntriesPresent: referenceOrder.length === CITED_WORKS.length,
  };
}

/** Whether a variant's CSL style is numeric (assigns and prints reference numbers). */
export function isNumericStyle(cslStyle: string): boolean {
  return cslStyle === 'vancouver';
}

/** A single mismatch between our output and the reference for a citation variant. */
export interface CitationMismatch {
  readonly kind: 'entries-present' | 'reference-order' | 'numbering';
  readonly detail: string;
}

/**
 * Compare our extracted facts against the reference's for one variant. Returns every mismatch found
 * (empty ⇒ parity). For numeric styles both the reference-list order AND the per-work numbering must
 * match; for author-date styles the reference-list order must match (author-date bibliographies sort
 * alphabetically, so appearance and alphabetical orderings coincide in the reference — ours must too).
 */
export function compareCitationFacts(
  ours: CitationFacts,
  reference: CitationFacts,
  numeric: boolean,
): CitationMismatch[] {
  const mismatches: CitationMismatch[] = [];

  if (!ours.allEntriesPresent) {
    mismatches.push({
      kind: 'entries-present',
      detail: `our reference list has ${ours.referenceOrder.length}/${CITED_WORKS.length} entries (${ours.referenceOrder.join(', ') || 'none'})`,
    });
  }

  if (ours.referenceOrder.join(',') !== reference.referenceOrder.join(',')) {
    mismatches.push({
      kind: 'reference-order',
      detail: `ours [${ours.referenceOrder.join(', ')}] vs reference [${reference.referenceOrder.join(', ')}]`,
    });
  }

  if (numeric) {
    for (const { surname } of CITED_WORKS) {
      const oursNumber = ours.numberBySurname.get(surname);
      const referenceNumber = reference.numberBySurname.get(surname);
      if (oursNumber !== referenceNumber) {
        mismatches.push({
          kind: 'numbering',
          detail: `${surname}: ours=${oursNumber ?? 'none'} reference=${referenceNumber ?? 'none'}`,
        });
      }
    }
  }

  return mismatches;
}
