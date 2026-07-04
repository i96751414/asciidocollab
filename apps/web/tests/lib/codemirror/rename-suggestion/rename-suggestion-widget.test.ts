/*
 * @jest-environment jsdom
 */
import type { EditorView } from '@codemirror/view';
import { RenameSuggestionWidget } from '@/lib/codemirror/rename-suggestion/rename-suggestion-widget';
import {
  applyRequestEffect,
  dismissRequestEffect,
  undoRequestEffect,
} from '@/lib/codemirror/rename-suggestion/rename-suggestion-effects';

/** A minimal fake view capturing dispatched effects. */
function fakeView(): { view: EditorView; dispatch: jest.Mock } {
  const dispatch = jest.fn();
  return { view: { dispatch } as unknown as EditorView, dispatch };
}

describe('RenameSuggestionWidget (FR-012/FR-017/FR-022)', () => {
  test('renders old→new, kind and impact, and Apply dispatches the apply request', () => {
    const { view, dispatch } = fakeView();
    const widget = new RenameSuggestionWidget({
      oldName: 'edition', newName: 'release', kind: 'attribute', usageCount: 7, fileCount: 3, collision: false, applied: false,
    });
    const dom = widget.toDOM(view);
    expect(dom.textContent).toContain('edition');
    expect(dom.textContent).toContain('release');
    expect(dom.textContent).toContain('7');
    expect(dom.textContent).toContain('3');
    dom.querySelector<HTMLButtonElement>('[data-testid="rename-suggestion-apply"]')!.click();
    expect(dispatch.mock.calls[0][0].effects.is(applyRequestEffect)).toBe(true);
  });

  test('collision state warns and offers no Apply (FR-022)', () => {
    const { view } = fakeView();
    const widget = new RenameSuggestionWidget({
      oldName: 'edition', newName: 'intro', kind: 'anchor', usageCount: 2, fileCount: 1, collision: true, applied: false,
    });
    const dom = widget.toDOM(view);
    expect(dom.dataset.collision).toBe('true');
    expect(dom.querySelector('[data-testid="rename-suggestion-apply"]')).toBeNull();
    expect(dom.textContent?.toLowerCase()).toContain('already exists');
  });

  test('applied state Undo dispatches the undo request (FR-020)', () => {
    const { view, dispatch } = fakeView();
    const widget = new RenameSuggestionWidget({
      oldName: 'edition', newName: 'release', kind: 'attribute', usageCount: 7, fileCount: 3, collision: false, applied: true,
    });
    const dom = widget.toDOM(view);
    dom.querySelector<HTMLButtonElement>('[data-testid="rename-suggestion-undo"]')!.click();
    expect(dispatch.mock.calls[0][0].effects.is(undoRequestEffect)).toBe(true);
  });

  test('Dismiss dispatches the dismiss request', () => {
    const { view, dispatch } = fakeView();
    const widget = new RenameSuggestionWidget({
      oldName: 'a', newName: 'b', kind: 'attribute', usageCount: 1, fileCount: 1, collision: false, applied: false,
    });
    widget.toDOM(view).querySelector<HTMLButtonElement>('[data-testid="rename-suggestion-dismiss"]')!.click();
    expect(dispatch.mock.calls[0][0].effects.is(dismissRequestEffect)).toBe(true);
  });

  test('eq() is true only when the visible data matches (decoration reuse)', () => {
    const data = { oldName: 'a', newName: 'b', kind: 'attribute' as const, usageCount: 1, fileCount: 1, collision: false, applied: false };
    expect(new RenameSuggestionWidget(data).eq(new RenameSuggestionWidget({ ...data }))).toBe(true);
    expect(new RenameSuggestionWidget(data).eq(new RenameSuggestionWidget({ ...data, newName: 'c' }))).toBe(false);
  });
});
