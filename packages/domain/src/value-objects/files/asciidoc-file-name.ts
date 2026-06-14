/**
 * @file The canonical AsciiDoc file-name rule. A file is an AsciiDoc document
 * when it has a non-empty stem and one of these extensions. This single
 * definition governs every place that asks "is this an AsciiDoc document?" —
 * main-file eligibility (FR-045), main-file consistency on rename (FR-070),
 * cross-file reference rewrite scoping (FR-066), and project-wide find-usages
 * (FR-065) — so the rules can never drift apart. The web mirrors this exact
 * predicate in apps/web/src/lib/asciidoc/file-name.ts (web ⊥ domain).
 */

/** File extensions treated as AsciiDoc documents (a valid main-file target). */
export const ASCIIDOC_EXTENSIONS = ['.adoc', '.asciidoc', '.asc', '.ad'];

/**
 * Whether `name` is an AsciiDoc document by extension (case-insensitive). A bare
 * extension with no stem (e.g. `.adoc`) is not a document.
 */
export function isAsciiDocumentFileName(name: string): boolean {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  return ASCIIDOC_EXTENSIONS.includes(name.slice(dotIndex).toLowerCase());
}
