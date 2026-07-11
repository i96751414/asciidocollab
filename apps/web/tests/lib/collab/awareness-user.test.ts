// Tests for apps/web/src/lib/collab/awareness-user.ts
import { buildAwarenessUser } from '@/lib/collab/awareness-user';
import { PRESENCE_COLOR_PALETTE } from '@/lib/editor-config';

describe('buildAwarenessUser', () => {
  test('returns a complete awareness user with deterministic colours and the avatar key', () => {
    const result = buildAwarenessUser({ userId: 'u-1', name: 'Alice', avatarKey: 'bottts:3' });
    expect(result.userId).toBe('u-1');
    expect(result.name).toBe('Alice');
    expect(result.avatarKey).toBe('bottts:3');
    expect(PRESENCE_COLOR_PALETTE).toContainEqual({ color: result.color, colorLight: result.colorLight });
  });

  test('publishes a null avatar key when the identity has no configured avatar', () => {
    const result = buildAwarenessUser({ userId: 'u-2', name: 'Bob' });
    expect(result.userId).toBe('u-2');
    expect(result.name).toBe('Bob');
    expect(result.avatarKey).toBeNull();
    expect(PRESENCE_COLOR_PALETTE).toContainEqual({ color: result.color, colorLight: result.colorLight });
  });
});
