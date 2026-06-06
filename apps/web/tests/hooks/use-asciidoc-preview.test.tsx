import { renderHook, act } from '@testing-library/react';
import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';
import DOMPurify from 'dompurify';

// ── Worker mock ──────────────────────────────────────────────────────────────

type WorkerMessageListener = (event: MessageEvent) => void;

class MockWorker {
  static instances: MockWorker[] = [];
  private messageListeners: WorkerMessageListener[] = [];
  postMessage = jest.fn();
  terminate = jest.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(type: string, listener: WorkerMessageListener) {
    if (type === 'message') this.messageListeners.push(listener);
  }

  emit(data: unknown) {
    for (const listener of this.messageListeners) {
      listener({ data } as MessageEvent);
    }
  }
}

// Mock the worker factory so tests never touch import.meta.url or the real worker file.
// jest.fn() allows spying on call counts; the implementation creates a MockWorker.
jest.mock('@/lib/create-render-worker', () => ({
  createRenderWorker: jest.fn(() => new MockWorker()),
}));

// ── DOMPurify mock ───────────────────────────────────────────────────────────

jest.mock('dompurify', () => ({
  sanitize: jest.fn((html: string) => html.replaceAll(/<script[^>]*>.*?<\/script>/gi, '')),
}));

// ── editor-config mock — fixed debounce so tests don't depend on env ─────────
jest.mock('@/lib/editor-config', () => ({
  ...jest.requireActual('@/lib/editor-config'),
  PREVIEW_DEBOUNCE_MS: 100,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function lastWorker() {
  return MockWorker.instances.at(-1)!;
}

const mockSanitize = DOMPurify.sanitize as jest.Mock;

import { createRenderWorker } from '@/lib/create-render-worker';
const mockCreateRenderWorker = createRenderWorker as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  MockWorker.instances = [];
  mockSanitize.mockClear();
  mockSanitize.mockImplementation((html: string) => html.replaceAll(/<script[^>]*>.*?<\/script>/gi, ''));
  mockCreateRenderWorker.mockClear();
  mockCreateRenderWorker.mockImplementation(() => new MockWorker());
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAsciidocPreview', () => {
  // (a) state transitions idle → pending → rendering → up-to-date on content change + worker response
  it('transitions idle → pending → rendering → up-to-date on content change and worker success', () => {
    const { result, rerender } = renderHook(
      ({ content, isEnabled }: { content: string; isEnabled: boolean }) =>
        useAsciidocPreview({ content, isEnabled, scrollToLine: null }),
      { initialProps: { content: '', isEnabled: true } },
    );

    // Empty content → idle
    expect(result.current.state).toBe('idle');

    // Provide content → pending
    act(() => rerender({ content: '= Hello', isEnabled: true }));
    expect(result.current.state).toBe('pending');

    // Debounce fires → rendering
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.state).toBe('rendering');

    // Worker responds with success → up-to-date
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Hello</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');
    expect(result.current.html).toBe('<h1>Hello</h1>');
    expect(result.current.error).toBeNull();
  });

  // (b) state → error on ok:false with previous html retained
  it('transitions to error on worker failure and retains previous html', () => {
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Good' } },
    );

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Good</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');
    expect(result.current.html).toBe('<h1>Good</h1>');

    // Second render fails
    act(() => rerender({ content: '= Bad' }));
    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 2, ok: false, html: null, error: 'parse error' }));

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('parse error');
    // Previous html retained
    expect(result.current.html).toBe('<h1>Good</h1>');
  });

  // (c) stale requestId responses are discarded
  it('discards stale worker responses (mismatched requestId)', () => {
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= First' } },
    );

    // requestId=1 dispatched
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.state).toBe('rendering');

    // New content — requestId=2 will be dispatched on next debounce
    act(() => rerender({ content: '= Second' }));
    act(() => jest.advanceTimersByTime(200));

    // Stale response for requestId=1 — should be discarded
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Stale</h1>', error: null }));
    expect(result.current.state).toBe('rendering');
    expect(result.current.html).toBeNull();

    // Fresh response for requestId=2
    act(() => lastWorker().emit({ requestId: 2, ok: true, html: '<h1>Second</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');
    expect(result.current.html).toBe('<h1>Second</h1>');
  });

  // (d) debounce: rapid content changes produce only one worker message
  it('coalesces rapid content changes into a single worker message after debounce', () => {
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: 'a' } },
    );

    act(() => rerender({ content: 'ab' }));
    act(() => rerender({ content: 'abc' }));
    act(() => rerender({ content: 'abcd' }));

    // Before debounce fires — no messages sent
    expect(lastWorker().postMessage).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(200));

    expect(lastWorker().postMessage).toHaveBeenCalledTimes(1);
    expect(lastWorker().postMessage.mock.calls[0][0].content).toBe('abcd');
  });

  // (e) scrollToLine calls querySelector and scrollIntoView
  it('scrolls to the element matching data-source-line when scrollToLine changes', () => {
    const mockScrollIntoView = jest.fn();
    const mockQuerySelectorAll = jest.fn().mockReturnValue([]);
    const mockQuerySelector = jest.fn().mockReturnValue({ scrollIntoView: mockScrollIntoView });

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    // Attach mock div to previewRef — override methods via prototype to avoid deprecation lint
    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<p data-source-line="5">text</p>', error: null }));

    act(() => rerender({ scrollToLine: { line: 5 } }));

    expect(mockQuerySelector).toHaveBeenCalledWith('[data-source-line="5"]');
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  // (f) scrollTop is saved and restored across re-renders
  it('saves and restores scrollTop across re-renders', () => {
    const { result } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Doc' } },
    );

    const div = document.createElement('div');
    let storedScrollTop = 120;
    Object.defineProperty(div, 'scrollTop', {
      get: () => storedScrollTop,
      set: (v: number) => { storedScrollTop = v; },
      configurable: true,
    });
    Object.defineProperty(div, 'innerHTML', { value: '', writable: true, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<p>text</p>', error: null }));

    expect(storedScrollTop).toBe(120);
  });

  // (g) isEnabled: false transitions state to idle
  it('transitions to idle when isEnabled is false', () => {
    const { result, rerender } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        useAsciidocPreview({ content: '= Hello', isEnabled, scrollToLine: null }),
      { initialProps: { isEnabled: true } },
    );

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Hello</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');

    act(() => rerender({ isEnabled: false }));
    expect(result.current.state).toBe('idle');
  });

  // (h) when isEnabled transitions from false back to true, a fresh render is triggered
  it('triggers fresh render when isEnabled transitions from false to true', () => {
    const { result, rerender } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        useAsciidocPreview({ content: '= Hello', isEnabled, scrollToLine: null }),
      { initialProps: { isEnabled: false } },
    );

    expect(result.current.state).toBe('idle');

    act(() => rerender({ isEnabled: true }));
    expect(result.current.state).toBe('pending');

    act(() => jest.advanceTimersByTime(200));
    expect(result.current.state).toBe('rendering');
  });

  // (j) hook must NOT directly mutate previewRef.current.innerHTML
  it('does not directly mutate previewRef.current.innerHTML on worker success', () => {
    const { result } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Hello' } },
    );

    const div = document.createElement('div');
    let directInnerHtmlMutation = false;
    const originalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(div, 'innerHTML', {
      get() {
        return (originalDescriptor?.get as (() => string) | undefined)?.call(this) ?? '';
      },
      set(v: string) {
        directInnerHtmlMutation = true;
        (originalDescriptor?.set as ((v: string) => void) | undefined)?.call(this, v);
      },
      configurable: true,
    });
    Object.assign(result.current.previewRef, { current: div });

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Hello</h1>', error: null }));

    expect(directInnerHtmlMutation).toBe(false);
  });

  // (k) each new ScrollRequest object triggers a scroll even when line number is identical
  it('scrolls on every new ScrollRequest object, even for the same line number', () => {
    const mockScrollIntoView = jest.fn();
    const mockQuerySelectorAll = jest.fn().mockReturnValue([]);
    const mockQuerySelector = jest.fn().mockReturnValue({ scrollIntoView: mockScrollIntoView });

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<p data-source-line="5">text</p>', error: null }));

    // First scroll request for line 5
    act(() => rerender({ scrollToLine: { line: 5 } }));
    expect(mockScrollIntoView).toHaveBeenCalledTimes(1);

    // Second scroll request — new object, same line number — must scroll again
    act(() => rerender({ scrollToLine: { line: 5 } }));
    expect(mockScrollIntoView).toHaveBeenCalledTimes(2);
  });

  // (l) debounce is cleared when isEnabled transitions to false mid-debounce
  it('clears pending debounce when isEnabled transitions to false before the timer fires', () => {
    const { result, rerender } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        useAsciidocPreview({ content: '= Hello', isEnabled, scrollToLine: null }),
      { initialProps: { isEnabled: true } },
    );

    // Initial render with content queues a debounce — state should be pending
    expect(result.current.state).toBe('pending');

    // Disable before the debounce fires
    act(() => rerender({ isEnabled: false }));
    expect(result.current.state).toBe('idle');

    // Advance timers well past the debounce window — worker must never receive a message
    act(() => jest.advanceTimersByTime(500));
    expect(lastWorker().postMessage).not.toHaveBeenCalled();
  });

  // (m) scroll fallback: nearest element with data-source-line ≤ target when exact match absent
  it('scrolls to the nearest element with data-source-line ≤ target when exact match is absent', () => {
    const mockScrollLine3 = jest.fn();
    const mockScrollLine7 = jest.fn();

    const el1 = document.createElement('p');
    el1.dataset['sourceLine'] = '1';

    const el3 = document.createElement('p');
    el3.dataset['sourceLine'] = '3';
    el3.scrollIntoView = mockScrollLine3;

    const el7 = document.createElement('p');
    el7.dataset['sourceLine'] = '7';
    el7.scrollIntoView = mockScrollLine7;

    const mockQuerySelector = jest.fn().mockReturnValue(null); // no exact match for line 5
    const mockQuerySelectorAll = jest.fn().mockReturnValue([el1, el3, el7]);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => rerender({ scrollToLine: { line: 5 } }));

    // No exact element for line 5 → falls back to largest ≤ 5, which is line 3
    expect(mockQuerySelector).toHaveBeenCalledWith('[data-source-line="5"]');
    expect(mockScrollLine3).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // Line 7 is beyond the target — must not scroll
    expect(mockScrollLine7).not.toHaveBeenCalled();
  });

  // The worker is created via the createRenderWorker factory, not a hardcoded static path.
  // This ensures Next.js webpack bundles the worker with all dependencies (asciidoctor).
  it('creates the worker via the createRenderWorker factory', () => {
    renderHook(() => useAsciidocPreview({ content: '= Hello', isEnabled: true, scrollToLine: null }));
    expect(mockCreateRenderWorker).toHaveBeenCalledTimes(1);
  });

  // Live update: renders new HTML after content changes following initial render
  it('renders updated HTML after content changes (live update)', () => {
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Initial' } },
    );

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: '<h1>Initial</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');
    expect(result.current.html).toBe('<h1>Initial</h1>');

    // Change content — should re-enter pending then rendering then up-to-date
    act(() => rerender({ content: '= Updated' }));
    expect(result.current.state).toBe('pending');

    act(() => jest.advanceTimersByTime(200));
    expect(result.current.state).toBe('rendering');

    act(() => lastWorker().emit({ requestId: 2, ok: true, html: '<h1>Updated</h1>', error: null }));
    expect(result.current.state).toBe('up-to-date');
    expect(result.current.html).toBe('<h1>Updated</h1>');
  });

  // debounce null check: debounce timer starts as null so clearTimeout is skipped on first render
  it('does not crash on first content change (debounceReference starts null)', () => {
    expect(() => {
      const { rerender } = renderHook(
        ({ content }: { content: string }) =>
          useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
        { initialProps: { content: '' } },
      );
      act(() => rerender({ content: '= Hello' }));
    }).not.toThrow();
  });

  // scrollToLine null guard: no crash when scrollToLine changes but previewRef is null
  it('does not crash when scrollToLine changes but previewRef.current is null', () => {
    expect(() => {
      const { rerender } = renderHook(
        ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
          useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
        { initialProps: { scrollToLine: null as { line: number } | null } },
      );
      act(() => rerender({ scrollToLine: { line: 5 } }));
    }).not.toThrow();
  });

  // scroll: no match even in querySelectorAll returns — target stays null, no crash
  it('does not crash when no elements match data-source-line', () => {
    const mockQuerySelector = jest.fn().mockReturnValue(null);
    const mockQuerySelectorAll = jest.fn().mockReturnValue([]);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    expect(() => {
      act(() => rerender({ scrollToLine: { line: 99 } }));
    }).not.toThrow();
  });

  // result.ok false with html=null goes to error branch, not up-to-date
  it('goes to error state when ok=true but html=null', () => {
    const { result } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Hello' } },
    );

    act(() => jest.advanceTimersByTime(200));
    // result.ok=true but html=null → should NOT set up-to-date
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: null, error: 'unexpected null' }));
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('unexpected null');
  });

  // (i) DOMPurify.sanitize is called; script tags are stripped from stored html
  it('sanitizes worker HTML through DOMPurify before storing', () => {
    const { result } = renderHook(
      ({ content }: { content: string }) =>
        useAsciidocPreview({ content, isEnabled: true, scrollToLine: null }),
      { initialProps: { content: '= Hello' } },
    );

    act(() => jest.advanceTimersByTime(200));
    const rawHtml = '<h1>Hello</h1><script>alert(1)</script>';
    act(() => lastWorker().emit({ requestId: 1, ok: true, html: rawHtml, error: null }));

    expect(mockSanitize).toHaveBeenCalledWith(rawHtml, { USE_PROFILES: { html: true } });
    expect(result.current.html).not.toContain('<script>');
    expect(result.current.html).toContain('<h1>Hello</h1>');
  });

  // terminate() must be called when the hook unmounts (kills L92 BlockStatement)
  it('calls worker.terminate() when the hook unmounts', () => {
    const { unmount } = renderHook(() =>
      useAsciidocPreview({ content: '= Hello', isEnabled: true, scrollToLine: null }),
    );
    const worker = lastWorker();
    expect(worker.terminate).not.toHaveBeenCalled();
    unmount();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  // querySelectorAll must be called with the exact '[data-source-line]' attribute selector (kills L147)
  it('querySelectorAll is called with exactly "[data-source-line]" when no exact querySelector match', () => {
    const mockQuerySelectorAll = jest.fn().mockReturnValue([]);
    const mockQuerySelector = jest.fn().mockReturnValue(null);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => rerender({ scrollToLine: { line: 10 } }));

    expect(mockQuerySelectorAll).toHaveBeenCalledWith('[data-source-line]');
  });

  // scroll fallback correctness: exactly one element scrolled, the nearest ≤ target (kills L152)
  it('scroll fallback picks element at line 3, not line 7, when target is line 5', () => {
    const mockScrollLine3 = jest.fn();
    const mockScrollLine7 = jest.fn();

    const el1 = document.createElement('p');
    el1.dataset['sourceLine'] = '1';

    const el3 = document.createElement('p');
    el3.dataset['sourceLine'] = '3';
    el3.scrollIntoView = mockScrollLine3;

    const el7 = document.createElement('p');
    el7.dataset['sourceLine'] = '7';
    el7.scrollIntoView = mockScrollLine7;

    const mockQuerySelector = jest.fn().mockReturnValue(null);
    const mockQuerySelectorAll = jest.fn().mockReturnValue([el1, el3, el7]);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => rerender({ scrollToLine: { line: 5 } }));

    expect(mockQuerySelectorAll).toHaveBeenCalledWith('[data-source-line]');
    // el3 (line=3) is the best: 3 ≤ 5 and 3 > 0; el7 (line=7) exceeds target
    expect(mockScrollLine3).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(mockScrollLine7).not.toHaveBeenCalled();
  });

  // L152 EqualityOperator: 'elementLine <= line' vs 'elementLine < line'
  // When elementLine === line (exact match exists in querySelectorAll but querySelector missed),
  // the ≤ check must still select that element.
  it('scroll fallback selects element at exact line when querySelector misses but querySelectorAll finds it', () => {
    const mockScrollExact = jest.fn();

    const elExact = document.createElement('p');
    elExact.dataset['sourceLine'] = '5';
    elExact.scrollIntoView = mockScrollExact;

    const elBefore = document.createElement('p');
    elBefore.dataset['sourceLine'] = '3';

    const mockQuerySelector = jest.fn().mockReturnValue(null);
    const mockQuerySelectorAll = jest.fn().mockReturnValue([elBefore, elExact]);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => rerender({ scrollToLine: { line: 5 } }));

    // The exact-line element (line=5 ≤ 5) must win over elBefore (line=3)
    expect(mockScrollExact).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('scroll fallback picks the first of two elements sharing the same source line', () => {
    const scrollSpyFirst = jest.fn();
    const scrollSpySecond = jest.fn();

    const elFirst = document.createElement('p');
    elFirst.dataset['sourceLine'] = '5';
    elFirst.scrollIntoView = scrollSpyFirst;

    const elSecond = document.createElement('p');
    elSecond.dataset['sourceLine'] = '5';
    elSecond.scrollIntoView = scrollSpySecond;

    const mockQuerySelector = jest.fn().mockReturnValue(null);
    const mockQuerySelectorAll = jest.fn().mockReturnValue([elFirst, elSecond]);

    const { result, rerender } = renderHook(
      ({ scrollToLine }: { scrollToLine: { line: number } | null }) =>
        useAsciidocPreview({ content: '= Doc', isEnabled: true, scrollToLine }),
      { initialProps: { scrollToLine: null as { line: number } | null } },
    );

    const div = document.createElement('div');
    Object.defineProperty(div, 'querySelector', { value: mockQuerySelector, configurable: true });
    Object.defineProperty(div, 'querySelectorAll', { value: mockQuerySelectorAll, configurable: true });
    Object.assign(result.current.previewRef, { current: div });

    act(() => rerender({ scrollToLine: { line: 5 } }));

    // The first element (encountered first in iteration) must be selected since
    // the second element has the same line number and cannot beat it with strict >
    expect(scrollSpyFirst).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollSpySecond).not.toHaveBeenCalled();
  });
});
