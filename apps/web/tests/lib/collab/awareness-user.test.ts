// Tests for apps/web/src/lib/collab/awareness-user.ts
import { buildAwarenessUser } from '@/lib/collab/awareness-user';
import { PRESENCE_COLOR_PALETTE } from '@/lib/editor-config';

describe('buildAwarenessUser', () => {
  test('returns a complete awareness user with deterministic colours', () => {
    const result = buildAwarenessUser({ userId: 'u-1', name: 'Alice', avatarUrl: 'https://example.com/avatar.png' });
    expect(result.userId).toBe('u-1');
    expect(result.name).toBe('Alice');
    expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    expect(PRESENCE_COLOR_PALETTE).toContainEqual({ color: result.color, colorLight: result.colorLight });
  });

  test('omits the avatarUrl field when the identity has no avatar', () => {
    const result = buildAwarenessUser({ userId: 'u-2', name: 'Bob' });
    expect(result.userId).toBe('u-2');
    expect(result.name).toBe('Bob');
    expect('avatarUrl' in result).toBe(false);
    expect(PRESENCE_COLOR_PALETTE).toContainEqual({ color: result.color, colorLight: result.colorLight });
  });
});
