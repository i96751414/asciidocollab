/**
 * The single source of truth for symbol-rename name validity, shared by the server (which enforces
 * it before a rename) and the editor (which pre-flights the offer). Each renamable kind has its own
 * rule: anchors allow a leading `_` and `:.-` (Asciidoctor id syntax — auto-generated section ids
 * begin with the `_` idprefix) while attributes are word-only. Kept in the zero-dep core so both
 * consumers use ONE definition and cannot drift.
 */

/** The kind of project symbol that can be renamed. A heading maps to `anchor` (its derived id). */
export type RenamableSymbolKind = 'anchor' | 'attribute';

/** New-name validity per kind: anchors allow a leading `_` and `:.-`; attributes are word-only. */
const NEW_NAME_PATTERN: Record<RenamableSymbolKind, RegExp> = {
  anchor: /^[A-Za-z_][\w:.-]*$/,
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
  return newName.length > 0 && NEW_NAME_PATTERN[kind].test(newName);
}
