import { evaluateUsages, lookupUsages } from '@/lib/codemirror/rename-suggestion/usage-lookup';
import type { SymbolUsage } from '@/lib/api/projects';

const usage = (fileNodeId: string, from: number, kind = 'xref'): SymbolUsage => ({
  fileNodeId,
  path: `${fileNodeId}.adoc`,
  kind,
  range: { from, to: from + 5 },
});

describe('evaluateUsages (FR-003 suppression)', () => {
  test('counts other occurrences across files, excluding the edited definition site', () => {
    const usages = [
      usage('A', 0, 'definition'), // the definition being edited — excluded
      usage('A', 40),
      usage('B', 10),
      usage('B', 80),
    ];
    const result = evaluateUsages(usages, { definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 3, fileCount: 2, suppressed: false });
  });

  test('suppresses when the only occurrence is the definition being edited', () => {
    const usages = [usage('A', 0, 'definition')];
    const result = evaluateUsages(usages, { definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 0, fileCount: 0, suppressed: true });
  });

  test('suppresses when there are no occurrences at all', () => {
    const result = evaluateUsages([], { definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result.suppressed).toBe(true);
  });

  test('does not exclude a same-named definition in ANOTHER file (still a real occurrence)', () => {
    const usages = [usage('A', 0, 'definition'), usage('B', 0, 'definition')];
    const result = evaluateUsages(usages, { definitionFileNodeId: 'A', definitionRange: { from: 0, to: 14 } });
    expect(result).toEqual({ usageCount: 1, fileCount: 1, suppressed: false });
  });
});

describe('lookupUsages', () => {
  test('queries by name + kind and returns the evaluated impact', async () => {
    const findFunction = jest.fn(async () => [usage('A', 0, 'definition'), usage('B', 10), usage('B', 20)]);
    const result = await lookupUsages({
      projectId: 'p1',
      oldName: 'edition',
      apiKind: 'attribute',
      definitionFileNodeId: 'A',
      definitionRange: { from: 0, to: 9 },
      findSymbolUsages: findFunction,
    });
    expect(findFunction).toHaveBeenCalledWith('p1', 'edition', 'attribute');
    expect(result).toEqual({ usageCount: 2, fileCount: 1, suppressed: false });
  });
});
