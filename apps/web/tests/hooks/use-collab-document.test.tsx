import { renderHook, act } from '@testing-library/react';
import * as Y from 'yjs';
import {
  useCollabDocument,
  type CollabProvider,
  type CreateCollabProvider,
} from '@/hooks/use-collab-document';
import { COLLAB_SYNC_TIMEOUT_MS } from '@/lib/editor-config';

/** A minimal driveable fake of HocuspocusProvider for the hook's event contract. */
class FakeProvider implements CollabProvider {
  awareness = { setLocalState: jest.fn(), setLocalStateField: jest.fn() } as unknown as CollabProvider['awareness'];
  destroy = jest.fn();
  document: Y.Doc;
  name: string;
  url: string;
  private handlers: Record<string, Array<(payload?: unknown) => void>> = {};

  constructor(arguments_: { url: string; name: string; document: Y.Doc }) {
    this.url = arguments_.url;
    this.name = arguments_.name;
    this.document = arguments_.document;
  }

  on(event: string, handler: (payload?: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  off(event: string, handler: (payload?: unknown) => void): void {
    this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
  }

  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers[event] ?? []) handler(payload);
  }
}

function setup(enabled = true) {
  let provider: FakeProvider | undefined;
  const createProvider: CreateCollabProvider = (arguments_) => {
    provider = new FakeProvider(arguments_);
    return provider;
  };
  const view = renderHook(
    (props: { projectId: string; yjsStateId: string; enabled: boolean }) =>
      useCollabDocument({ ...props, createProvider }),
    { initialProps: { projectId: 'p1', yjsStateId: 'y1', enabled } },
  );
  return { view, getProvider: () => provider as FakeProvider };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useCollabDocument', () => {
  test('starts in "connecting" and transitions to "synced" on sync', () => {
    const { view, getProvider } = setup();
    expect(view.result.current.connectionState).toBe('connecting');

    act(() => getProvider().emit('synced', { state: true }));
    expect(view.result.current.connectionState).toBe('synced');
  });

  test('builds the room name as `${projectId}/${yjsStateId}`', () => {
    const { getProvider } = setup();
    expect(getProvider().name).toBe('p1/y1');
  });

  test('goes to "reconnecting" when the connection drops after syncing', () => {
    const { view, getProvider } = setup();
    act(() => getProvider().emit('synced', { state: true }));
    act(() => getProvider().emit('status', { status: 'disconnected' }));
    expect(view.result.current.connectionState).toBe('reconnecting');
  });

  test('goes "offline" when never synced within the timeout', () => {
    const { view } = setup();
    act(() => {
      jest.advanceTimersByTime(COLLAB_SYNC_TIMEOUT_MS + 1);
    });
    expect(view.result.current.connectionState).toBe('offline');
  });

  test('staying offline is not overridden once timed out', () => {
    const { view } = setup();
    act(() => {
      jest.advanceTimersByTime(COLLAB_SYNC_TIMEOUT_MS + 1);
    });
    expect(view.result.current.connectionState).toBe('offline');
  });

  test('tears down provider + Y.Doc and clears awareness on unmount', () => {
    const { view, getProvider } = setup();
    const provider = getProvider();
    const doc = view.result.current.doc as Y.Doc;
    const docDestroy = jest.spyOn(doc, 'destroy');

    view.unmount();

    expect(provider.awareness.setLocalState).toHaveBeenCalledWith(null);
    expect(provider.destroy).toHaveBeenCalled();
    expect(docDestroy).toHaveBeenCalled();
  });

  test('recreates the provider and tears down the old one when the file switches', () => {
    const { view, getProvider } = setup();
    const first = getProvider();

    act(() => {
      view.rerender({ projectId: 'p1', yjsStateId: 'y2', enabled: true });
    });

    expect(first.destroy).toHaveBeenCalled();
    expect(getProvider().name).toBe('p1/y2');
  });

  test('does not create a provider when disabled', () => {
    const { view, getProvider } = setup(false);
    expect(getProvider()).toBeUndefined();
    expect(view.result.current.doc).toBeNull();
  });

  // readSyncedState returns true when the event fires with no payload — covers the fallback `return true`
  test('transitions to "synced" when the synced event fires with no payload', () => {
    const { view, getProvider } = setup();
    act(() => getProvider().emit('synced')); // no payload
    expect(view.result.current.connectionState).toBe('synced');
  });

  // readStatus returns undefined on a payload with no "status" key — handleStatus becomes a no-op
  test('ignores a status event whose payload carries no recognized status field', () => {
    const { view, getProvider } = setup();
    act(() => getProvider().emit('status', {})); // no 'status' key
    expect(view.result.current.connectionState).toBe('connecting');
    act(() => getProvider().emit('status', 'unexpected-string')); // not an object
    expect(view.result.current.connectionState).toBe('connecting');
  });

  // handleStatus else-if (status === 'connecting') — stays 'offline' once timed out
  test('stays "offline" when a connecting status event fires after the sync timeout', () => {
    const { view, getProvider } = setup();
    act(() => { jest.advanceTimersByTime(COLLAB_SYNC_TIMEOUT_MS + 1); });
    expect(view.result.current.connectionState).toBe('offline');
    act(() => getProvider().emit('status', { status: 'connecting' }));
    expect(view.result.current.connectionState).toBe('offline');
  });

  // handleStatus else-if (status === 'connecting') — stays 'reconnecting' when already reconnecting after sync
  test('stays "reconnecting" when a connecting status event fires while reconnecting', () => {
    const { view, getProvider } = setup();
    act(() => getProvider().emit('synced', { state: true }));
    act(() => getProvider().emit('status', { status: 'disconnected' }));
    expect(view.result.current.connectionState).toBe('reconnecting');
    act(() => getProvider().emit('status', { status: 'connecting' }));
    expect(view.result.current.connectionState).toBe('reconnecting');
  });

  test('publishes the local user presence identity on the awareness "user" field (US2)', () => {
    let provider: FakeProvider | undefined;
    const createProvider: CreateCollabProvider = (arguments_) => {
      provider = new FakeProvider(arguments_);
      return provider;
    };
    renderHook(() =>
      useCollabDocument({
        projectId: 'p1',
        yjsStateId: 'y1',
        enabled: true,
        user: { userId: 'u-1', name: 'Ada' },
        createProvider,
      }),
    );

    const setField = (provider as FakeProvider).awareness?.setLocalStateField as jest.Mock;
    expect(setField).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ userId: 'u-1', name: 'Ada', color: expect.any(String), colorLight: expect.any(String) }),
    );
  });
});
