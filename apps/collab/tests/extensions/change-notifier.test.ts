import { ChangeNotifierExtension } from '../../src/extensions/change-notifier';
import type { onChangePayload } from '@hocuspocus/server';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440001';
const YJS_STATE_ID = '550e8400-e29b-41d4-a716-446655440002';
const DOCUMENT_NAME = `${PROJECT_ID}/${YJS_STATE_ID}`;
const NOTIFY_PATH = '/internal/collab/content-changed';
const API_URL = 'http://127.0.0.1:4001';
const NOTIFY_URL = `${API_URL}${NOTIFY_PATH}`;

const mockLogger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };

function makeExtension(fetchFunction: jest.Mock, debounceMs = 100) {
  return new ChangeNotifierExtension({
    apiInternalUrl: API_URL,
    notifyPath: NOTIFY_PATH,
    debounceMs,
    logger: mockLogger as never,
    fetch: fetchFunction as unknown as typeof globalThis.fetch,
  });
}

function okFetch() {
  return jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
}

function changePayload(documentName = DOCUMENT_NAME): onChangePayload {
  return { documentName } as unknown as onChangePayload;
}

describe('ChangeNotifierExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('POSTs the room ids to the notify URL after the debounce window elapses', async () => {
    const fetchFunction = okFetch();
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload());
    expect(fetchFunction).not.toHaveBeenCalled(); // debounced — nothing yet

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchFunction).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFunction.mock.calls[0];
    expect(url).toBe(NOTIFY_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ projectId: PROJECT_ID, yjsStateId: YJS_STATE_ID });
  });

  it('coalesces a burst of changes into a single notify per room', async () => {
    const fetchFunction = okFetch();
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload());
    await extension.onChange(changePayload());
    await extension.onChange(changePayload());
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchFunction).toHaveBeenCalledTimes(1);
  });

  it('does not expose a beforeHandleMessage hook (avoids firing on awareness/sync traffic)', () => {
    const extension = makeExtension(okFetch());
    expect((extension as unknown as { beforeHandleMessage?: unknown }).beforeHandleMessage).toBeUndefined();
  });

  it('skips presence rooms (no notify)', async () => {
    const fetchFunction = okFetch();
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload(`presence/${PROJECT_ID}`));
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchFunction).not.toHaveBeenCalled();
  });

  it('tolerates a rejected fetch (best-effort) and logs a warning', async () => {
    const fetchFunction = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload());
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('logs a warning on a non-2xx response but does not throw', async () => {
    const fetchFunction = jest.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload());
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('onDestroy cancels a pending notify', async () => {
    const fetchFunction = okFetch();
    const extension = makeExtension(fetchFunction);

    await extension.onChange(changePayload());
    await extension.onDestroy();
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchFunction).not.toHaveBeenCalled();
  });
});
