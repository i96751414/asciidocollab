import { extractReferences, definitionSymbols } from '@asciidocollab/asciidoc-core';
import { ProjectSymbol } from '../../types/asciidoc';
import { RenamableSymbolKind } from './rename-symbol-validation';

/**
 * Pure text-rewriting core for symbol renames: name matching,
 * conflict detection, and computing/applying the definition + reference edits for
 * one file's content. No repositories, no I/O — extracted from the use case so the
 * scan→apply rewrite logic lives in one place and is testable in isolation.
 */

/** A single in-file text replacement. */
export interface Edit {
  /** Start offset of the slice to replace (inclusive). */
  from: number;
  /** End offset of the slice to replace (exclusive). */
  to: number;
  /** The text to substitute for `[from, to)`. */
  replacement: string;
}

/** A name comparison predicate for a given symbol/reference candidate name. */
export type NameMatcher = (candidate: string) => boolean;

/** The id part of an xref target, dropping any `file.adoc#` prefix and `,label` suffix. */
function xrefAnchorId(target: string): string {
  const hashIndex = target.indexOf('#');
  return hashIndex === -1 ? target : target.slice(hashIndex + 1);
}

/** Replace the id part of an xref target with `newName`, preserving any `file.adoc#` path prefix. */
function rewriteXrefTarget(target: string, newName: string): string {
  const hashIndex = target.indexOf('#');
  return hashIndex === -1 ? newName : target.slice(0, hashIndex + 1) + newName;
}

/**
 * Builds a name-comparison predicate for a kind. Anchors are case-sensitive,
 * attributes are not (Asciidoctor downcases attribute names).
 *
 * @param kind - The symbol kind being renamed.
 * @param name - The name to compare candidates against.
 * @returns A predicate that returns true when a candidate matches `name`.
 */
export function nameMatcher(kind: RenamableSymbolKind, name: string): NameMatcher {
  if (kind === 'attribute') {
    const lower = name.toLowerCase();
    return (candidate) => candidate.toLowerCase() === lower;
  }
  return (candidate) => candidate === name;
}

/**
 * Reports whether the file's symbols include a definition of the new name that is
 * a distinct symbol from the one being renamed, so that renaming would silently
 * merge two symbols (warn before breaking).
 *
 * @param symbols - The symbols defined in the file.
 * @param symbolKind - The kind of symbol being renamed.
 * @param matchesNew - Predicate matching the proposed new name.
 * @param matchesOld - Predicate matching the current (old) name.
 * @returns True when a conflicting definition of the new name exists.
 */
export function hasConflictingDefinition(
  symbols: ProjectSymbol[],
  symbolKind: RenamableSymbolKind,
  matchesNew: NameMatcher,
  matchesOld: NameMatcher,
): boolean {
  // An anchor rename also collides with a heading's auto-generated section id (it shares the xref
  // namespace), so consider the whole definition set for the family — not just same-kind symbols —
  // via the single `definitionSymbols` authority (which drops a section an explicit anchor declares).
  return definitionSymbols(symbols, symbolKind).some(
    (symbol) => matchesNew(symbol.name) && !matchesOld(symbol.name),
  );
}

/**
 * Builds the definition + reference edits needed to rename `oldName` to `newName`
 * within one file's content.
 *
 * @param symbolKind - The kind of symbol being renamed.
 * @param oldName - The current symbol name.
 * @param newName - The replacement name.
 * @param content - The file's full text.
 * @param symbols - The symbols defined in the file (from {@link extractSymbols}).
 * @param matchesOld - Predicate matching the current (old) name.
 * @returns The list of in-file replacements (unordered).
 */
export function computeEdits(
  symbolKind: RenamableSymbolKind,
  oldName: string,
  newName: string,
  content: string,
  symbols: ProjectSymbol[],
  matchesOld: NameMatcher,
): Edit[] {
  const edits: Edit[] = [];

  // Definitions (the `[[old]]` / `:old:` declaration itself).
  for (const symbol of symbols) {
    if (symbol.kind !== symbolKind || !matchesOld(symbol.name)) continue;
    const slice = content.slice(symbol.range.from, symbol.range.to);
    const replacement = slice.replace(symbol.name, newName);
    if (replacement !== slice) edits.push({ from: symbol.range.from, to: symbol.range.to, replacement });
  }

  // A `<<old>>` reference in a file that locally defines `old` as a SECTION heading resolves to THAT
  // local section, not the identically-derived section being renamed elsewhere. Since a rename never
  // rewrites a section heading, rewriting such a reference would leave it dangling (pointing at an id
  // no heading in this file carries). So a file that owns the id through its own section keeps its
  // references — unless an explicit `[[old]]`/`[#old]` anchor also declares it, in which case that
  // anchor is the symbol being renamed and its references do follow.
  const ownsIdViaLocalSection =
    symbolKind === 'anchor' &&
    symbols.some((symbol) => symbol.kind === 'section' && matchesOld(symbol.name)) &&
    !symbols.some((symbol) => symbol.kind === 'anchor' && matchesOld(symbol.name));

  // References (the `<<old>>` / `{old}` usages).
  for (const reference of ownsIdViaLocalSection ? [] : extractReferences('', content)) {
    let oldRaw: string | undefined;
    let newRaw: string | undefined;
    if (symbolKind === 'anchor' && reference.kind === 'xref' && xrefAnchorId(reference.target) === oldName) {
      oldRaw = reference.target;
      newRaw = rewriteXrefTarget(reference.target, newName);
    } else if (symbolKind === 'attribute' && reference.kind === 'attributeRef' && matchesOld(reference.target)) {
      oldRaw = reference.target;
      newRaw = newName;
    }
    if (oldRaw === undefined || newRaw === undefined) continue;

    const slice = content.slice(reference.range.from, reference.range.to);
    const replacement = slice.replace(oldRaw, newRaw);
    if (replacement !== slice) edits.push({ from: reference.range.from, to: reference.range.to, replacement });
  }

  return edits;
}

/**
 * Applies a file's edits to its content, right-to-left so earlier offsets stay
 * valid as later slices are replaced.
 *
 * @param content - The original file text.
 * @param edits - The edits to apply (will be sorted in place by descending `from`).
 * @returns The rewritten content.
 */
export function applyEdits(content: string, edits: Edit[]): string {
  edits.sort((a, b) => b.from - a.from);
  let next = content;
  for (const edit of edits) next = next.slice(0, edit.from) + edit.replacement + next.slice(edit.to);
  return next;
}

// Re-export so the use case's first-pass scan reads naturally alongside the rewrite helpers.
export { extractSymbols } from '@asciidocollab/asciidoc-core';
