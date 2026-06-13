/**
 * @file Presentation copy of the domain AsciiDoc file-name rule
 * (packages/domain/src/asciidoc/file-name.ts). The web cannot depend on the
 * domain package, so this mirrors the authoritative extension set; keep the two
 * in sync so the UI agrees with what the server accepts as an AsciiDoc document.
 * Lives in lib/ (not in a component) so it can be imported without pulling in
 * the preview/render-worker module graph.
 */

/** File extensions treated as AsciiDoc documents. */
const ASCIIDOC_EXTENSIONS = new Set(['.adoc', '.asciidoc', '.asc', '.ad']);

/** Returns true if the file name has an AsciiDoc extension (.adoc, .asciidoc, .asc, .ad). */
export function isAsciiDocumentFile(nodeName: string): boolean {
  const dotIndex = nodeName.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  const extension = nodeName.slice(dotIndex).toLowerCase();
  return ASCIIDOC_EXTENSIONS.has(extension);
}
