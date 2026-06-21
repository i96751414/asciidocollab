import { renderHook, act } from '@testing-library/react';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useSectionOutline } from '@/hooks/use-section-outline';
import { outlineField, outlineResolvedScopeFacet } from '@/lib/codemirror/asciidoc-outline';
import { refreshHeadingLevelsEffect } from '@/lib/codemirror/asciidoc-heading-levels';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const stableIdentityPath = (path: string): string => path;

function createMockView(entries: SectionOutlineEntry[] = []) {
  return {
    state: {
      field: jest.fn(() => entries),
    },
    destroy: jest.fn(),
    dispatch: jest.fn(),
  } as unknown as EditorView;
}

/**
 * A real CM6 view over `doc` with the outline field installed, mounted on a detached element.
 */
function createRealView(doc: string, getScope?: () => ReadonlyMap<string, string>): EditorView {
  const extensions = getScope
    ? [outlineField, outlineResolvedScopeFacet.of(getScope)]
    : [outlineField];
  return new EditorView({
    state: EditorState.create({ doc, extensions }),
  });
}

// Fake readFile / fileIdForPath for scope-aware tests
function makeReader(files: Record<string, string>) {
  return (path: string): string | null => files[path] ?? null;
}
function makeFileIdForPath(map: Record<string, string>) {
  return (path: string): string => map[path] ?? path;
}

describe('useSectionOutline — current-file scope (existing behaviour)', () => {
  test('hook subscribes to the CM6 view and returns current outline entries', () => {
    const entries: SectionOutlineEntry[] = [{ level: 1, title: 'Introduction', line: 3, from: 0 }];
    const view = createMockView(entries);
    const { result } = renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(result.current.entries).toEqual(entries);
    expect(result.current.effectiveScope).toBe('current');
  });

  test('returns empty entries when no headings present', () => {
    const view = createMockView([]);
    const { result } = renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(result.current.entries).toEqual([]);
  });

  test('returns empty entries when reading the outline field throws', () => {
    const view = {
      state: {
        field: jest.fn(() => {
          throw new Error('field not present');
        }),
      },
      destroy: jest.fn(),
      dispatch: jest.fn(),
    } as unknown as EditorView;
    const { result } = renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(result.current.entries).toEqual([]);
  });

  test('returns empty entries when view is null', () => {
    const { result } = renderHook(() => useSectionOutline(null));
    expect(result.current.entries).toEqual([]);
  });

  test('does not start a setInterval (uses event-driven subscription instead)', () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const view = createMockView([]);
    renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    jest.useRealTimers();
  });

  test('reflects the resolved-scope facet so the outline resolves {attr} titles', () => {
    const scope: ReadonlyMap<string, string> = new Map([['productname', 'Acme']]);
    const view = createRealView('== {productName} Guide', () => scope);
    const { result } = renderHook(() =>
      useSectionOutline(view, { getResolvedScope: () => scope }),
    );
    expect(result.current.entries.map((entry) => entry.title)).toEqual(['Acme Guide']);
    view.destroy();
  });

  test('recomputes the outline live when the resolved scope changes (refresh effect)', () => {
    let scope: ReadonlyMap<string, string> = new Map();
    const view = createRealView('== {productName} Guide', () => scope);
    const { result, rerender } = renderHook(
      ({ s }: { s: ReadonlyMap<string, string> }) =>
        useSectionOutline(view, { getResolvedScope: () => s }),
      { initialProps: { s: scope } },
    );
    expect(result.current.entries.map((entry) => entry.title)).toEqual(['{productName} Guide']);
    scope = new Map([['productname', 'Acme']]);
    rerender({ s: scope });
    expect(result.current.entries.map((entry) => entry.title)).toEqual(['Acme Guide']);
    view.destroy();
  });

  test('dispatches refreshHeadingLevelsEffect when the inherited offset changes', () => {
    const view = createRealView('== Sub');
    const dispatchSpy = jest.spyOn(view, 'dispatch');
    const { rerender } = renderHook(
      ({ o }: { o: number }) => useSectionOutline(view, { getInheritedOffset: () => o }),
      { initialProps: { o: 0 } },
    );
    dispatchSpy.mockClear();
    rerender({ o: 2 });
    const dispatchedRefresh = dispatchSpy.mock.calls.some((call) => {
      const spec = call[0] as { effects?: StateEffect<unknown> | StateEffect<unknown>[] } | undefined;
      const effects = spec?.effects;
      const list = Array.isArray(effects) ? effects : (effects ? [effects] : []);
      return list.some((effect) => effect.is(refreshHeadingLevelsEffect));
    });
    expect(dispatchedRefresh).toBe(true);
    view.destroy();
  });
});

// T007: scope-aware useSectionOutline (feature 032)
describe('useSectionOutline — scope-aware (feature 032)', () => {
  const mainFiles = {
    'main.adoc': '= Title\n\n== Main Section\n\ninclude::ch.adoc[]\n',
    'ch.adoc': '== Child Section\n',
  };
  const fileIdMap = { 'main.adoc': 'id-main', 'ch.adoc': 'id-ch' };

  test('scopePreference=current returns current-file entries only and effectiveScope=current', () => {
    const view = createMockView([
      { level: 0, title: 'Title', line: 1, from: 0 },
      { level: 1, title: 'Main Section', line: 3, from: 10 },
    ]);
    const { result } = renderHook(() =>
      useSectionOutline(view as unknown as EditorView, {
        scopePreference: 'current',
        rootFilePath: 'main.adoc',
        openFile: { id: 'id-main', path: 'main.adoc' },
        readFile: makeReader(mainFiles),
        fileIdForPath: makeFileIdForPath(fileIdMap),
      }),
    );
    expect(result.current.effectiveScope).toBe('current');
    // In current scope, falls back to the CM6 view entries
    expect(result.current.entries.length).toBeGreaterThan(0);
  });

  test('scopePreference=full returns assembled entries from all included files', () => {
    const view = createMockView();
    const { result } = renderHook(() =>
      useSectionOutline(view as unknown as EditorView, {
        scopePreference: 'full',
        rootFilePath: 'main.adoc',
        openFile: { id: 'id-main', path: 'main.adoc' },
        readFile: makeReader(mainFiles),
        fileIdForPath: makeFileIdForPath(fileIdMap),
      }),
    );
    expect(result.current.effectiveScope).toBe('full');
    const titles = result.current.entries.map((entry) => entry.title);
    expect(titles).toContain('Title');
    expect(titles).toContain('Main Section');
    expect(titles).toContain('Child Section');
  });

  test('scopePreference=full with rootFilePath=null falls back to current scope', () => {
    const view = createMockView([{ level: 1, title: 'Only This', line: 1, from: 0 }]);
    const { result } = renderHook(() =>
      useSectionOutline(view as unknown as EditorView, {
        scopePreference: 'full',
        rootFilePath: null,
        openFile: { id: 'id-open', path: 'open.adoc' },
        readFile: makeReader({ 'open.adoc': '== Only This\n' }),
        fileIdForPath: makeFileIdForPath({ 'open.adoc': 'id-open' }),
      }),
    );
    expect(result.current.effectiveScope).toBe('current');
  });

  test('recomputes when readFile content changes (open-file edit)', () => {
    const files: Record<string, string> = { 'main.adoc': '== Before\n', 'ch.adoc': '' };
    const view = createMockView();
    const { result, rerender } = renderHook(
      ({ files: f }: { files: typeof files }) =>
        useSectionOutline(view as unknown as EditorView, {
          scopePreference: 'full',
          rootFilePath: 'main.adoc',
          openFile: { id: 'id-main', path: 'main.adoc' },
          readFile: makeReader(f),
          fileIdForPath: makeFileIdForPath({ 'main.adoc': 'id-main', 'ch.adoc': 'id-ch' }),
        }),
      { initialProps: { files } },
    );
    expect(result.current.entries.map((entry) => entry.title)).toContain('Before');

    const updatedFiles = { 'main.adoc': '== After\n', 'ch.adoc': '' };
    rerender({ files: updatedFiles });
    expect(result.current.entries.map((entry) => entry.title)).toContain('After');
    expect(result.current.entries.map((entry) => entry.title)).not.toContain('Before');
  });

  test('recomputes when rootFilePath changes (main-document change)', () => {
    const files = {
      'main1.adoc': '== From Main1\n',
      'main2.adoc': '== From Main2\n',
    };
    const view = createMockView();
    const { result, rerender } = renderHook(
      ({ root }: { root: string }) =>
        useSectionOutline(view as unknown as EditorView, {
          scopePreference: 'full',
          rootFilePath: root,
          openFile: { id: 'id-m1', path: root },
          readFile: makeReader(files),
          fileIdForPath: makeFileIdForPath({ 'main1.adoc': 'id-m1', 'main2.adoc': 'id-m2' }),
        }),
      { initialProps: { root: 'main1.adoc' } },
    );
    expect(result.current.entries.map((entry) => entry.title)).toContain('From Main1');
    rerender({ root: 'main2.adoc' });
    expect(result.current.entries.map((entry) => entry.title)).toContain('From Main2');
  });
});

// T017: debounced recompute when reachableDocVersion increments (feature 032 / FR-013b)
describe('useSectionOutline — reachable-doc debounced recompute (feature 032)', () => {
  test('delays recompute ~400ms when reachableDocVersion increments but readFile is stable', () => {
    jest.useFakeTimers();

    // Simulates the content cache: `stableReadFile` has a constant identity but reads a mutable
    // variable so the same function returns different content after the cache is updated.
    let contentForCh = '== Included Old\n';
    const stableReadFile = (path: string): string | null => {
      if (path === 'main.adoc') return '= Main\n\ninclude::ch.adoc[]\n';
      if (path === 'ch.adoc') return contentForCh;
      return null;
    };
    const view = createMockView();

    const { result, rerender } = renderHook(
      ({ version }: { version: number }) =>
        useSectionOutline(view as unknown as EditorView, {
          scopePreference: 'full',
          rootFilePath: 'main.adoc',
          openFile: { id: 'id-main', path: 'main.adoc' },
          readFile: stableReadFile,
          fileIdForPath: stableIdentityPath,
          reachableDocVersion: version,
        }),
      { initialProps: { version: 0 } },
    );

    // Baseline: shows old content.
    expect(result.current.entries.map((entry) => entry.title)).toContain('Included Old');

    // Simulate the content cache being updated by the reachable-doc observer, then version bump.
    contentForCh = '== Included New\n';
    rerender({ version: 1 });

    // Immediately after the version bump the outline has NOT yet recomputed (debounced).
    expect(result.current.entries.map((entry) => entry.title)).not.toContain('Included New');
    expect(result.current.entries.map((entry) => entry.title)).toContain('Included Old');

    // After the debounce window fires, the outline reflects the updated content.
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.entries.map((entry) => entry.title)).toContain('Included New');
    expect(result.current.entries.map((entry) => entry.title)).not.toContain('Included Old');

    jest.useRealTimers();
  });
});
