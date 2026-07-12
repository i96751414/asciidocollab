// The `@citation-js/*` packages ship no type declarations. These ambient `declare module` blocks in a
// `.d.ts` SCRIPT file (no top-level import/export, so it is NOT a module) describe exactly the small
// surface the citations shim (`src/workers/shims/citation-js.ts`) uses — the ONE place this app crosses
// into citation-js's untyped world. Everything on the shim side is fully typed against these; no
// `any`/`as` escapes past here. `@citation-js/plugin-bibtex` / `@citation-js/plugin-csl` are imported
// only for their registration side effect, so they need no typed surface.
declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-csl';

declare module '@citation-js/core' {
  /** A single CSL-JSON record (a parsed `.bib` entry). Only the fields we read for sorting are named. */
  export interface CslEntry {
    /** The citation key — equals the BibTeX key; used to register and reference the entry. */
    readonly id: string;
    /** Contributor list; the first family name seeds the alphabetical sort key. */
    readonly author?: readonly { readonly family?: string; readonly given?: string; readonly literal?: string }[];
    /** The work title; the alphabetical fallback sort key when there is no author. */
    readonly title?: string;
    /** Issued date; its first year part is the secondary alphabetical sort key. */
    readonly issued?: { readonly 'date-parts'?: readonly (readonly number[])[] };
  }

  /** One item inside a citeproc citation cluster (a key plus optional narrative flags / locator). */
  export interface CiteprocItem {
    readonly id: string;
    readonly 'author-only'?: boolean;
    readonly 'suppress-author'?: boolean;
    readonly locator?: string;
    readonly label?: string;
  }

  /** Bibliography metadata: `entry_ids[i]` names the key(s) whose formatted text is `entries[i]`. */
  export interface CiteprocBibliographyMeta {
    readonly entry_ids: readonly (readonly string[])[];
  }

  /** The subset of the citeproc engine this shim drives. */
  export interface CiteprocEngine {
    /** Register the working set of keys (order fixes numeric labels + citation-number bibliographies). */
    updateItems(ids: readonly string[]): void;
    /** Format one citation cluster to the engine's output format (here, plain text). */
    makeCitationCluster(items: readonly CiteprocItem[]): string;
    /** Produce the reference list: `[meta, entries]`, parallel by index. */
    makeBibliography(): [CiteprocBibliographyMeta, readonly string[]];
  }

  /** The `@csl` plugin config: an engine factory plus a registry of the bundled CSL styles. */
  export interface CslPluginConfig {
    engine(data: readonly CslEntry[], style: string, locale: string, format: string): CiteprocEngine;
    readonly styles: { has(name: string): boolean };
  }

  /** citation-js parser/formatter facade; `get()` returns the parsed CSL-JSON records. */
  export class Cite {
    constructor(data: string);
    get(): CslEntry[];
  }

  /** Global plugin registry; `config.get('@csl')` exposes the CSL engine factory + style registry. */
  export const plugins: { readonly config: { get(name: string): CslPluginConfig } };
}
