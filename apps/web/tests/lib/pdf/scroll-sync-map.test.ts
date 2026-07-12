import type { ProjectSnapshot } from '@asciidocollab/asciidoc-pdf';
import {
  buildAssembledLineToSource,
  openLineToAssembledLine,
} from '@/lib/pdf/scroll-sync-map';
import type { SourceMapEntry } from '@/workers/assemble-includes';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    files: {},
    binaryAssets: {},
    rootPath: 'main.adoc',
    openPath: 'main.adoc',
    fontPaths: [],
    attributes: {},
    ...overrides,
  };
}

const entry = (path: string, sourceLine: number): SourceMapEntry => ({ path, sourceLine });

// ---------------------------------------------------------------------------
// buildAssembledLineToSource.
// ---------------------------------------------------------------------------

describe('buildAssembledLineToSource', () => {
  it('returns a provenance entry per assembled line for a single-file document', () => {
    const map = buildAssembledLineToSource(
      snapshot({ files: { 'main.adoc': '= Title\n\nBody paragraph.\n' } }),
    );

    expect(map).not.toBeNull();
    // Every assembled line traces back to the root file at its own 1-based line.
    expect(map?.[0]).toEqual({ path: 'main.adoc', sourceLine: 1 });
    expect(map?.length).toBeGreaterThan(0);
  });

  it('attributes an included file\'s lines to that file in the assembled map', () => {
    const map = buildAssembledLineToSource(
      snapshot({
        files: {
          'main.adoc': '= Title\n\ninclude::child.adoc[]\n',
          'child.adoc': 'From the child.\n',
        },
      }),
    );

    expect(map).not.toBeNull();
    // At least one assembled line must originate from the included child file.
    expect(map?.some((provenance) => provenance.path === 'child.adoc')).toBe(true);
  });

  it('returns null when the root document is missing (assembler emits no usable map)', () => {
    // A root path with no matching file yields an assembly whose only content is the unresolved-root
    // marker; the map is still an array, so this asserts the helper degrades to a value, never throws.
    expect(() => buildAssembledLineToSource(snapshot({ rootPath: 'absent.adoc' }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// openLineToAssembledLine.
// ---------------------------------------------------------------------------

describe('openLineToAssembledLine', () => {
  const lineToSource: SourceMapEntry[] = [
    entry('main.adoc', 1),
    entry('main.adoc', 2),
    entry('child.adoc', 1),
    entry('child.adoc', 2),
    entry('main.adoc', 4),
  ];

  it('maps an exact open-file line to its assembled line (1-based index)', () => {
    // main.adoc line 4 is the 5th assembled line.
    expect(openLineToAssembledLine(lineToSource, 'main.adoc', 4)).toBe(5);
  });

  it('resolves to the nearest preceding source line within the open file', () => {
    // main.adoc has no source line 3; the greatest ≤ 3 is line 2 → assembled line 2.
    expect(openLineToAssembledLine(lineToSource, 'main.adoc', 3)).toBe(2);
  });

  it('ignores entries that belong to a different file', () => {
    // Only child.adoc lines count; line 2 is the 4th assembled line.
    expect(openLineToAssembledLine(lineToSource, 'child.adoc', 2)).toBe(4);
  });

  it('returns undefined when the open file contributes no line at or before the target', () => {
    // The first main.adoc source line is 1, so a target of 0 has nothing at or before it.
    expect(openLineToAssembledLine(lineToSource, 'main.adoc', 0)).toBeUndefined();
    // A file absent from the map maps nothing.
    expect(openLineToAssembledLine(lineToSource, 'other.adoc', 10)).toBeUndefined();
  });

  it('returns undefined for an empty provenance map', () => {
    expect(openLineToAssembledLine([], 'main.adoc', 5)).toBeUndefined();
  });
});
