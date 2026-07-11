// Tests for apps/web/src/hooks/use-collab-presence.ts
import { renderHook, act } from '@testing-library/react';
import { useCollabPresence, type AwarenessLike } from '@/hooks/use-collab-presence';
import type { AwarenessUser } from '@/lib/collab/awareness-user';

function fakeUser(userId: string, name: string, avatarKey?: string | null): AwarenessUser {
  return { userId, name, color: '#30bced', colorLight: '#30bced33', avatarKey: avatarKey ?? null };
}

function fakeAwareness(localClientId: number, states: Map<number, { user?: AwarenessUser }>): AwarenessLike & { emit: () => void } {
  const handlers: Array<() => void> = [];
  return {
    clientID: localClientId,
    getStates: () => states,
    on: (_event: string, handler: () => void) => { handlers.push(handler); },
    off: (_event: string, handler: () => void) => {
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    },
    emit: () => { for (const h of handlers) h(); },
  };
}

describe('useCollabPresence', () => {
  test('returns other participants on mount, excluding the local client', () => {
    const states = new Map([
      [1, { user: fakeUser('u-local', 'Me') }],
      [2, { user: fakeUser('u-bea', 'Bea') }],
    ]);
    const awareness = fakeAwareness(1, states);
    const { result } = renderHook(() => useCollabPresence(awareness));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('Bea');
  });

  test('carries the peer avatar key through to the participant', () => {
    const states = new Map([
      [1, { user: fakeUser('u-local', 'Me') }],
      [2, { user: fakeUser('u-bea', 'Bea', 'bottts:3') }],
    ]);
    const awareness = fakeAwareness(1, states);
    const { result } = renderHook(() => useCollabPresence(awareness));

    expect(result.current[0].avatarKey).toBe('bottts:3');
  });

  test('skips awareness entries that have no user field', () => {
    const states = new Map([
      [1, { user: fakeUser('u-local', 'Me') }],
      [2, {}], // no user field → must be skipped
      [3, { user: fakeUser('u-bea', 'Bea') }],
    ]);
    const awareness = fakeAwareness(1, states);
    const { result } = renderHook(() => useCollabPresence(awareness));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('Bea');
  });

  test('returns an empty array when awareness is null', () => {
    const { result } = renderHook(() => useCollabPresence(null));
    expect(result.current).toHaveLength(0);
  });

  test('updates participants when awareness changes fire', () => {
    const states = new Map<number, { user?: AwarenessUser }>([
      [1, { user: fakeUser('u-local', 'Me') }],
    ]);
    const awareness = fakeAwareness(1, states);
    const { result } = renderHook(() => useCollabPresence(awareness));

    expect(result.current).toHaveLength(0);

    act(() => {
      states.set(2, { user: fakeUser('u-bea', 'Bea') });
      awareness.emit();
    });

    expect(result.current).toHaveLength(1);
  });

  test('unsubscribes on unmount', () => {
    const states = new Map([[1, { user: fakeUser('u-local', 'Me') }]]);
    const awareness = fakeAwareness(1, states);
    const { unmount, result } = renderHook(() => useCollabPresence(awareness));
    unmount();

    act(() => {
      states.set(2, { user: fakeUser('u-bea', 'Bea') });
      awareness.emit();
    });

    // After unmount, the hook's state should not have been updated
    expect(result.current).toHaveLength(0);
  });
});
