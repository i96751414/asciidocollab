/**
 * Pure new-name validation for symbol renames (US12/FR-064). Each renamable kind
 * has its own validity rule: anchors allow `:.-` (Asciidoctor id syntax) while
 * attributes are word-only. Kept separate from the use case so the rule lives in
 * one place and is independently testable.
 */

/** The kind of project symbol that can be renamed (FR-064). */
export type RenamableSymbolKind = 'anchor' | 'attribute';

/** A new-name validity rule per symbol kind: anchors allow `:.-`; attributes are word-only. */
const NEW_NAME_PATTERN: Record<RenamableSymbolKind, RegExp> = {
  anchor: /^[A-Za-z][\w:.-]*$/,
  attribute: /^[A-Za-z0-9][\w-]*$/,
};

/**
 * Reports whether `newName` is a syntactically valid name for the given kind.
 *
 * @param kind - The symbol kind being renamed.
 * @param newName - The proposed replacement name.
 * @returns True when `newName` matches the kind's name pattern.
 */
export function isValidNewName(kind: RenamableSymbolKind, newName: string): boolean {
  return NEW_NAME_PATTERN[kind].test(newName);
}
