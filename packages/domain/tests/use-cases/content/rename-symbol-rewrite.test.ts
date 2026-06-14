import {
  computeEdits,
  applyEdits,
  nameMatcher,
  hasConflictingDefinition,
  extractSymbols,
} from '../../../src/use-cases/content/rename-symbol-rewrite';

/**
 * Direct unit coverage for the pure rename-rewrite core (US12/FR-064). These cases also pin the
 * anchor↔section-id interaction: a code review flagged that renaming an anchor whose id collides
 * with a section heading might rewrite `<<id>>` references without updating the heading. That does
 * not happen because (a) an explicit-id heading (`[#id]` / `[[id]]`) is extracted as an ANCHOR
 * symbol too, so the definition pass rewrites it and the section's id follows; and (b) an
 * auto-generated section id always begins with `_`, which an anchor name (`[A-Za-z]…`) can never
 * match — so a non-underscore anchor rename cannot collide with an auto-id. These tests guard both.
 */
describe('computeEdits / applyEdits', () => {
  test('renames an anchor definition and its reference', () => {
    const content = '[[intro]]\nText\n\nSee <<intro>>.\n';
    const symbols = extractSymbols('', content);
    const result = applyEdits(content, computeEdits('anchor', 'intro', 'overview', content, symbols, nameMatcher('anchor', 'intro')));
    expect(result).toBe('[[overview]]\nText\n\nSee <<overview>>.\n');
  });

  test('renames an attribute definition and its references (case-insensitive)', () => {
    const content = ':Ver: 1\n\nVersion {ver} / {Ver}.\n';
    const symbols = extractSymbols('', content);
    const result = applyEdits(content, computeEdits('attribute', 'Ver', 'rel', content, symbols, nameMatcher('attribute', 'Ver')));
    expect(result).toBe(':rel: 1\n\nVersion {rel} / {rel}.\n');
  });

  test('renaming an anchor that backs a section id (explicit [#id]) updates both the id and the xref', () => {
    const content = '[#intro]\n== Introduction\n\nSee <<intro>>.\n';
    const symbols = extractSymbols('', content);
    const result = applyEdits(content, computeEdits('anchor', 'intro', 'overview', content, symbols, nameMatcher('anchor', 'intro')));
    expect(result).toBe('[#overview]\n== Introduction\n\nSee <<overview>>.\n');
    expect(result).not.toContain('<<intro>>');
  });

  test('a cross-file xref target keeps its file prefix when the fragment id is renamed', () => {
    const content = 'See xref:book.adoc#intro[here] and <<intro>>.\n';
    const symbols = extractSymbols('', content);
    const result = applyEdits(content, computeEdits('anchor', 'intro', 'overview', content, symbols, nameMatcher('anchor', 'intro')));
    expect(result).toContain('xref:book.adoc#overview[here]');
    expect(result).toContain('<<overview>>');
  });

  test('renaming onto an existing (explicit) section id is detected as a conflict', () => {
    const content = '[#target]\n== Target\n\n[[src]]\ntext\n';
    const symbols = extractSymbols('', content);
    expect(
      hasConflictingDefinition(symbols, 'anchor', nameMatcher('anchor', 'target'), nameMatcher('anchor', 'src')),
    ).toBe(true);
  });
});
