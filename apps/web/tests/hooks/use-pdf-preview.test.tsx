import { renderHook, act } from '@testing-library/react';
import type {
  FromWorker,
  ProjectSnapshot,
  RenderResult,
  ToWorker,
} from '@asciidocollab/asciidoc-pdf';
import { usePdfPreview } from '@/hooks/use-pdf-preview';

// ── Worker mock ──────────────────────────────────────────────────────────────

type WorkerMessageListener = (event: MessageEvent<FromWorker>) => void;

class MockWorker {
  static instances: MockWorker[] = [];
  private messageListeners: WorkerMessageListener[] = [];
  postMessage = jest.fn<void, [ToWorker]>();
  terminate = jest.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(type: string, listener: WorkerMessageListener) {
    if (type === 'message') this.messageListeners.push(listener);
  }

  emit(data: FromWorker) {
    for (const listener of this.messageListeners) {
      listener({ data } as MessageEvent<FromWorker>);
    }
  }
}

// Mock the worker factory so tests never touch import.meta.url or the real worker file.
jest.mock('@/lib/create-pdf-worker', () => ({
  createPdfWorker: jest.fn(() => new MockWorker()),
}));

// Fixed debounce so tests don't depend on the env-configured value.
jest.mock('@/lib/editor-config', () => ({
  ...jest.requireActual('@/lib/editor-config'),
  PREVIEW_DEBOUNCE_MS: 100,
}));

import { createPdfWorker } from '@/lib/create-pdf-worker';
const mockCreatePdfWorker = createPdfWorker as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function lastWorker() {
  return MockWorker.instances.at(-1)!;
}

/** Render messages the hook posted (excludes the mount-time `warmup`). */
function renderCalls(worker: MockWorker) {
  return worker.postMessage.mock.calls
    .map((call) => call[0])
    .filter((message): message is Extract<ToWorker, { type: 'render' }> => message.type === 'render');
}

function makeSnapshot(files: Record<string, string>, rootPath = 'main.adoc'): ProjectSnapshot {
  return {
    files,
    binaryAssets: {},
    rootPath,
    openPath: rootPath,
    fontPaths: [],
    attributes: {},
  };
}

function makeResult(requestId: string, sourceMap?: RenderResult['sourceMap']): RenderResult {
  return {
    requestId,
    mode: 'preview',
    pdf: new Blob(['%PDF'], { type: 'application/pdf' }),
    diagnostics: [],
    stats: { renderMs: 1, cacheHits: 0, rasterFallbacks: 0 },
    ...(sourceMap === undefined ? {} : { sourceMap }),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  MockWorker.instances = [];
  mockCreatePdfWorker.mockClear();
  mockCreatePdfWorker.mockImplementation(() => new MockWorker());
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePdfPreview', () => {
  it('creates a single warm worker and sends a warmup message on mount', () => {
    renderHook(() =>
      usePdfPreview({ snapshot: makeSnapshot({ 'main.adoc': '= Doc' }), isEnabled: true }),
    );

    expect(mockCreatePdfWorker).toHaveBeenCalledTimes(1);
    const warmups = lastWorker().postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === 'warmup');
    expect(warmups).toHaveLength(1);
  });

  it('coalesces rapid snapshot changes into a single latest render after debounce', () => {
    const { rerender } = renderHook(
      ({ snapshot }: { snapshot: ProjectSnapshot }) => usePdfPreview({ snapshot, isEnabled: true }),
      { initialProps: { snapshot: makeSnapshot({ 'main.adoc': '= A' }) } },
    );

    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= AB' }) }));
    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= ABC' }) }));
    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= ABCD' }) }));

    // No render posted before the debounce elapses.
    expect(renderCalls(lastWorker())).toHaveLength(0);

    act(() => jest.advanceTimersByTime(200));

    const renders = renderCalls(lastWorker());
    expect(renders).toHaveLength(1);
    expect(renders[0]!.request.snapshot.files['main.adoc']).toBe('= ABCD');
    expect(renders[0]!.request.mode).toBe('preview');
  });

  it('marks the preview as rendering while a render is in flight', () => {
    const { result } = renderHook(() =>
      usePdfPreview({ snapshot: makeSnapshot({ 'main.adoc': '= Doc' }), isEnabled: true }),
    );

    act(() => jest.advanceTimersByTime(200));
    expect(result.current.isRendering).toBe(true);

    act(() => lastWorker().emit({ type: 'result', result: makeResult('1') }));
    expect(result.current.isRendering).toBe(false);
    expect(result.current.pdf).toBeInstanceOf(Blob);
  });

  it('exposes the source map from a result and clears it on a later map-less render', () => {
    const sourceMap = [{ line: 1, page: 1, yFraction: 0.2 }];
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: ProjectSnapshot }) => usePdfPreview({ snapshot, isEnabled: true }),
      { initialProps: { snapshot: makeSnapshot({ 'main.adoc': '= A' }) } },
    );

    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ type: 'result', result: makeResult('1', sourceMap) }));
    expect(result.current.sourceMap).toEqual(sourceMap);

    // A subsequent render whose result carries no map resets it, so a stale map never lingers.
    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= AB' }) }));
    act(() => jest.advanceTimersByTime(200));
    act(() => lastWorker().emit({ type: 'result', result: makeResult('2') }));
    expect(result.current.sourceMap).toBeUndefined();
  });

  it('discards a stale result whose requestId is not the latest issued', () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: ProjectSnapshot }) => usePdfPreview({ snapshot, isEnabled: true }),
      { initialProps: { snapshot: makeSnapshot({ 'main.adoc': '= First' }) } },
    );

    // requestId '1' issued.
    act(() => jest.advanceTimersByTime(200));
    // requestId '2' issued.
    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= Second' }) }));
    act(() => jest.advanceTimersByTime(200));

    // Stale result for the superseded request '1' must be ignored.
    act(() => lastWorker().emit({ type: 'result', result: makeResult('1') }));
    expect(result.current.pdf).toBeUndefined();
    expect(result.current.isRendering).toBe(true);

    // The latest result is honored.
    act(() => lastWorker().emit({ type: 'result', result: makeResult('2') }));
    expect(result.current.pdf).toBeInstanceOf(Blob);
    expect(result.current.isRendering).toBe(false);
  });

  it('tracks the phase from progress messages and ignores stale progress', () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: ProjectSnapshot }) => usePdfPreview({ snapshot, isEnabled: true }),
      { initialProps: { snapshot: makeSnapshot({ 'main.adoc': '= First' }) } },
    );

    act(() => jest.advanceTimersByTime(200));
    act(() => rerender({ snapshot: makeSnapshot({ 'main.adoc': '= Second' }) }));
    act(() => jest.advanceTimersByTime(200));

    // Stale progress for request '1' ignored.
    act(() => lastWorker().emit({ type: 'progress', requestId: '1', phase: 'converting' }));
    expect(result.current.phase).toBeUndefined();

    // Fresh progress for request '2' honored.
    act(() => lastWorker().emit({ type: 'progress', requestId: '2', phase: 'converting' }));
    expect(result.current.phase).toBe('converting');
  });

  it('surfaces diagnostics carried by a successful result', () => {
    const { result } = renderHook(() =>
      usePdfPreview({ snapshot: makeSnapshot({ 'main.adoc': '= Doc' }), isEnabled: true }),
    );

    act(() => jest.advanceTimersByTime(200));
    const withDiagnostics: RenderResult = {
      ...makeResult('1'),
      diagnostics: [
        { severity: 'warning', code: 'remote-skipped', resource: 'https://x', message: 'skipped' },
      ],
    };
    act(() => lastWorker().emit({ type: 'result', result: withDiagnostics }));

    expect(result.current.diagnostics).toHaveLength(1);
    expect(result.current.diagnostics[0]!.code).toBe('remote-skipped');
  });

  it('exposes a fatal error and stops rendering', () => {
    const { result } = renderHook(() =>
      usePdfPreview({ snapshot: makeSnapshot({ 'main.adoc': '= Doc' }), isEnabled: true }),
    );

    act(() => jest.advanceTimersByTime(200));
    act(() =>
      lastWorker().emit({
        type: 'error',
        error: { requestId: '1', phase: 'convert', code: 'convert-failed', message: 'boom' },
      }),
    );

    expect(result.current.error?.message).toBe('boom');
    expect(result.current.isRendering).toBe(false);
  });

  it('forwards caller-supplied changedPaths on a delta render', () => {
    const { rerender } = renderHook(
      ({ snapshot, changedPaths }: { snapshot: ProjectSnapshot; changedPaths?: readonly string[] }) =>
        usePdfPreview({ snapshot, isEnabled: true, changedPaths }),
      { initialProps: { snapshot: makeSnapshot({ 'main.adoc': '= A', 'ch.adoc': '== A' }) } },
    );

    // Initial full render — no changedPaths.
    act(() => jest.advanceTimersByTime(200));
    expect(renderCalls(lastWorker())[0]!.request.changedPaths).toBeUndefined();

    // A single file changed → the caller supplies the delta.
    act(() =>
      rerender({
        snapshot: makeSnapshot({ 'main.adoc': '= A', 'ch.adoc': '== B' }),
        changedPaths: ['ch.adoc'],
      }),
    );
    act(() => jest.advanceTimersByTime(200));

    const renders = renderCalls(lastWorker());
    expect(renders).toHaveLength(2);
    expect(renders[1]!.request.changedPaths).toEqual(['ch.adoc']);
  });

  it('cancels a pending debounced render when the preview is disabled before it fires', () => {
    // A stable snapshot identity keeps the snapshot effect from re-running on the toggle, so the
    // enable effect is the one that clears the still-pending debounce timer.
    const snapshot = makeSnapshot({ 'main.adoc': '= Doc' });
    const { rerender } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) => usePdfPreview({ snapshot, isEnabled }),
      { initialProps: { isEnabled: true } },
    );

    // A render is scheduled on mount but the debounce window has not elapsed yet.
    expect(renderCalls(lastWorker())).toHaveLength(0);

    // Disabling before the timer fires must clear the pending render so nothing is posted.
    act(() => rerender({ isEnabled: false }));
    act(() => jest.advanceTimersByTime(500));

    expect(renderCalls(lastWorker())).toHaveLength(0);
  });

  it('does not render while disabled and terminates the worker on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        usePdfPreview({ snapshot: makeSnapshot({ 'main.adoc': '= Doc' }), isEnabled }),
      { initialProps: { isEnabled: false } },
    );

    act(() => jest.advanceTimersByTime(500));
    expect(renderCalls(lastWorker())).toHaveLength(0);

    act(() => rerender({ isEnabled: true }));
    act(() => jest.advanceTimersByTime(200));
    expect(renderCalls(lastWorker())).toHaveLength(1);

    const worker = lastWorker();
    expect(worker.terminate).not.toHaveBeenCalled();
    unmount();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
