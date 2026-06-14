import { renderHook } from '@testing-library/react';
import { useSectionOutline } from '@/hooks/use-section-outline';
import type { EditorView } from '@codemirror/view';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

jest.mock('@/lib/codemirror/asciidoc-outline', () => ({
  outlineField: { extension: 'outline' },
}));

function createMockView(entries: SectionOutlineEntry[] = []) {
  return {
    state: {
      field: jest.fn(() => entries),
    },
    destroy: jest.fn(),
    dispatch: jest.fn(),
  } as unknown as EditorView;
}

describe('useSectionOutline', () => {
  test('hook subscribes to the CM6 view and returns current outline', () => {
    const entries: SectionOutlineEntry[] = [
      { level: 1, title: 'Introduction', line: 3, from: 0 },
    ];
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
});
