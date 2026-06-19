import { renderHook } from '@testing-library/react';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useSectionOutline } from '@/hooks/use-section-outline';
import { outlineField, outlineResolvedScopeFacet } from '@/lib/codemirror/asciidoc-outline';
import { refreshHeadingLevelsEffect } from '@/lib/codemirror/asciidoc-heading-levels';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

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
 * A real CM6 view over `doc` with the outline field installed, mounted on a detached element. The
 * resolved-scope facet is provided by the editor itself in production (buildEditorExtensions), so the
 * hook no longer installs it — tests that need a live scope wire the facet through `getScope`.
 */
function createRealView(doc: string, getScope?: () => ReadonlyMap<string, string>): EditorView {
  const extensions = getScope
    ? [outlineField, outlineResolvedScopeFacet.of(getScope)]
    : [outlineField];
  return new EditorView({
    state: EditorState.create({ doc, extensions }),
  });
}

describe('useSectionOutline', () => {
  test('hook subscribes to the CM6 view and returns current outline', () => {
    const entries: SectionOutlineEntry[] = [{ level: 1, title: 'Introduction', line: 3, from: 0 }];
    const view = createMockView(entries);
    const { result } = renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(result.current).toEqual(entries);
  });

  test('returns empty array when no headings present', () => {
    const view = createMockView([]);
    const { result } = renderHook(() => useSectionOutline(view as unknown as EditorView));
    expect(result.current).toEqual([]);
  });

  test('returns empty array when reading the outline field throws', () => {
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
    expect(result.current).toEqual([]);
  });

  test('returns empty array when view is null', () => {
    const { result } = renderHook(() => useSectionOutline(null));
    expect(result.current).toEqual([]);
  });

  // Issue 9: the hook must NOT use a polling interval; it must wire a CM6
  // updateListener so outline updates are event-driven, not timer-driven.
  test('does not start a setInterval (uses event-driven subscription instead)', () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const view = createMockView([]);

    renderHook(() => useSectionOutline(view as unknown as EditorView));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    jest.useRealTimers();
  });

  // T080: the outline resolves `{attr}` titles against the file's resolved cross-document scope. The
  // scope is supplied by the editor's own `outlineResolvedScopeFacet` provider (here wired directly on
  // the view); the hook reads the resulting outline and keeps it in sync.
  test('reflects the resolved-scope facet so the outline resolves {attr} titles', () => {
    const scope: ReadonlyMap<string, string> = new Map([['productname', 'Acme']]);
    const view = createRealView('== {productName} Guide', () => scope);
    const { result } = renderHook(() =>
      useSectionOutline(view, { getResolvedScope: () => scope }),
    );
    expect(result.current.map((entry) => entry.title)).toEqual(['Acme Guide']);
    view.destroy();
  });

  // T080: when the resolved scope / inherited offset changes out-of-band (e.g. main-file change),
  // the hook dispatches refreshHeadingLevelsEffect and the returned outline recomputes live. The view
  // reads the live scope through the facet accessor, so mutating it and bumping the version recomputes.
  test('recomputes the outline live when the resolved scope changes (refresh effect)', () => {
    let scope: ReadonlyMap<string, string> = new Map();
    const view = createRealView('== {productName} Guide', () => scope);
    const { result, rerender } = renderHook(
      ({ s }: { s: ReadonlyMap<string, string> }) =>
        useSectionOutline(view, { getResolvedScope: () => s }),
      { initialProps: { s: scope } },
    );
    expect(result.current.map((entry) => entry.title)).toEqual(['{productName} Guide']);

    scope = new Map([['productname', 'Acme']]);
    rerender({ s: scope });
    expect(result.current.map((entry) => entry.title)).toEqual(['Acme Guide']);
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
