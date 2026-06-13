/**
 * @file The canonical AsciiDoc file-name rule. A file is an AsciiDoc document
 * when its name ends in one of these extensions. This single definition governs
 * every place that asks "is this an AsciiDoc document?" — main-file eligibility
 * (FR-045), main-file consistency on rename (FR-070), cross-file reference
 * rewrite scoping (FR-066), and project-wide find-usages (FR-065) — so the
 * rules can never drift apart.
 */

/** File extensions treated as AsciiDoc documents (a valid main-file target). */
export const ASCIIDOC_EXTENSIONS = ['.adoc', '.asciidoc', '.asc', '.ad'];

/** Whether `name` is an AsciiDoc document by extension (case-insensitive). */
export function isAsciiDocumentFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ASCIIDOC_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
