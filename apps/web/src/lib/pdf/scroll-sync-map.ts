/**
 * Editor→PDF scroll-sync coordinate bridge. The engine's block source map is keyed to the ASSEMBLED
 * (include-expanded) document the worker converts, but the editor's cursor line is in the OPEN file.
 * These pure helpers translate an open-file line into its assembled-document line so the preview panel
 * can scroll to the exact rendered block. They are extracted from the editor layout so the branchy
 * translation is unit-testable in isolation (the layout only wires them to its live state).
 */

import { assembleIncludes, type SourceMapEntry } from '@/workers/assemble-includes';
import type { ProjectSnapshot } from '@asciidocollab/asciidoc-pdf';

/** The assembled-line→source provenance map: entry `i` gives the origin of assembled line `i + 1`. */
export type AssembledLineToSource = readonly SourceMapEntry[];

/**
 * Build the assembled-document line→source-file provenance map for a snapshot's render root by running
 * the SAME include assembly the PDF pipeline's include-resolve stage runs (the snapshot's root path and
 * its seeded attributes), this time requesting the provenance map. Returns null when the assembler
 * produced no map.
 *
 * @param snapshot - The render snapshot whose root document is assembled.
 * @returns The assembled-line→source provenance map, or null when unavailable.
 */
export function buildAssembledLineToSource(snapshot: ProjectSnapshot): AssembledLineToSource | null {
  const assembled = assembleIncludes(
    snapshot.rootPath,
    (path: string) => snapshot.files[path] ?? null,
    { seedAttributes: new Map(Object.entries(snapshot.attributes)), withSourceMap: true },
  );
  return assembled.sourceMap?.lineToSource ?? null;
}

/**
 * Translate an open-file line into the assembled-document line the engine source map is keyed in: the
 * assembled line whose provenance is the GREATEST source line at or before the target within the open
 * file (so a blank or filtered target line still resolves to the nearest preceding mapped line, and
 * entries from other files are ignored). Returns undefined when the open file contributes no assembled
 * line at or before the target.
 *
 * @param lineToSource - The assembled-line→source provenance map.
 * @param openPath - The project-relative path of the open file the target line belongs to.
 * @param openLine - The 1-based line within the open file to translate.
 * @returns The 1-based assembled-document line, or undefined when none maps.
 */
export function openLineToAssembledLine(
  lineToSource: AssembledLineToSource,
  openPath: string,
  openLine: number,
): number | undefined {
  let bestAssembledLine: number | undefined;
  let bestSourceLine = -1;
  for (const [index, entry] of lineToSource.entries()) {
    if (entry.path === openPath && entry.sourceLine <= openLine && entry.sourceLine > bestSourceLine) {
      bestSourceLine = entry.sourceLine;
      bestAssembledLine = index + 1;
    }
  }
  return bestAssembledLine;
}
