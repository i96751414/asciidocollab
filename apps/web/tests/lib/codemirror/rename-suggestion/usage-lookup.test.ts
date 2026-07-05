import { evaluateUsages } from '@/lib/codemirror/rename-suggestion/usage-lookup';
import type { RenameSymbolKind, SymbolUsage } from '@/lib/api/projects';

const usage = (fileNodeId: string, from: number, kind = 'xref', definitionKind?: 'section' | 'anchor' | 'attribute'): SymbolUsage => ({
  fileNodeId,
  path: `${fileNodeId}.adoc`,
  kind,
  ...(definitionKind && { definitionKind }),
  range: { from, to: from + 5 },
});

const anchorAt = (from: number, fileNodeId = 'B') => usage(fileNodeId, from, 'definition', 'anchor');
const sectionAt = (from: number, fileNodeId = 'B') => usage(fileNodeId, from, 'definition', 'section');

describe('evaluateUsages (suppression)', () => {
  test('counts other occurrences across files, excluding the edited definition site', () => {
    const usages = [
      usage('A', 0, 'definition', 'attribute'), // the definition being edited — excluded
      usage('A', 40),
      usage('B', 10),
      usage('B', 80),
    ];
    const result = evaluateUsages(usages, { targetFamily: 'attribute', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 3, fileCount: 2, suppressed: false });
  });

  test('suppresses when the only occurrence is the definition being edited', () => {
    const usages = [usage('A', 0, 'definition', 'attribute')];
    const result = evaluateUsages(usages, { targetFamily: 'attribute', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 0, fileCount: 0, suppressed: true });
  });

  test('suppresses when there are no occurrences at all', () => {
    const result = evaluateUsages([], { targetFamily: 'anchor', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result.suppressed).toBe(true);
  });

  test('counts a same-name anchor/attribute definition in ANOTHER file (the rename rewrites it)', () => {
    for (const targetFamily of ['anchor', 'attribute'] as RenameSymbolKind[]) {
      const definitionKind = targetFamily === 'anchor' ? 'anchor' : 'attribute';
      const usages = [usage('A', 0, 'definition', definitionKind), usage('B', 0, 'definition', definitionKind)];
      const result = evaluateUsages(usages, { targetFamily, definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
      expect(result).toEqual({ usageCount: 1, fileCount: 1, suppressed: false });
    }
  });

  test('suppresses when the only other occurrence is an unrelated same-id SECTION heading (not rewritten)', () => {
    // Two independent files each with `== Section title` derive the same auto-id `_section_title`,
    // but there is no xref to it. A section heading is never rewritten by the rename, so the other
    // definition must not offer a phantom refactor.
    const usages = [sectionAt(0, 'A'), sectionAt(0, 'B')];
    const result = evaluateUsages(usages, { targetFamily: 'anchor', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 0, fileCount: 0, suppressed: true });
  });

  test('still offers the rename when a real xref reference to the id exists', () => {
    const usages = [sectionAt(0, 'A'), usage('B', 30, 'xref')];
    const result = evaluateUsages(usages, { targetFamily: 'anchor', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 1, fileCount: 1, suppressed: false });
  });

  test('excludes a reference in a file that owns the id via its OWN section heading (Apply leaves it untouched)', () => {
    // File A is the edited file with a real lingering reference. File B independently has its own
    // `== Section title` (a section definition of the id) AND a `<<_section_title>>` self-reference —
    // that reference resolves to B's own section, which the rename never rewrites, so it must not be
    // counted (mirrors the server). Only A's reference is a real rewritable usage.
    const usages = [usage('A', 10, 'xref'), sectionAt(0, 'B'), usage('B', 40, 'xref')];
    const result = evaluateUsages(usages, { targetFamily: 'anchor', definitionFileNodeId: 'A', definitionRange: { from: 100, to: 118 } });
    expect(result).toEqual({ usageCount: 1, fileCount: 1, suppressed: false });
  });

  test('counts an explicit anchor that coincides with a heading id (the rename does rewrite it)', () => {
    // Renaming a heading whose derived id `_details` also exists as an explicit `[[_details]]` anchor
    // in another file: that anchor IS rewritten, so it is a real occurrence (unlike a section).
    const usages = [sectionAt(0, 'A'), anchorAt(20, 'B')];
    const result = evaluateUsages(usages, { targetFamily: 'anchor', definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 1, fileCount: 1, suppressed: false });
  });
});
