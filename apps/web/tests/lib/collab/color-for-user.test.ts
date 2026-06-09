// Tests for apps/web/src/lib/collab/color-for-user.ts
import { colorForUser } from '@/lib/collab/color-for-user';
import { PRESENCE_COLOR_PALETTE } from '@/lib/editor-config';

describe('colorForUser', () => {
  test('returns a colour pair drawn from the fixed palette', () => {
    const result = colorForUser('user-1');
    expect(PRESENCE_COLOR_PALETTE).toContainEqual(result);
  });

  test('is deterministic — same id always yields the same colour', () => {
    expect(colorForUser('abc-123')).toEqual(colorForUser('abc-123'));
  });

  test('is total over arbitrary ids (empty, unicode, very long)', () => {
    for (const id of ['', '😀', 'x'.repeat(1000), '550e8400-e29b-41d4-a716-446655440001']) {
      const result = colorForUser(id);
      expect(typeof result.color).toBe('string');
      expect(typeof result.colorLight).toBe('string');
      expect(PRESENCE_COLOR_PALETTE).toContainEqual(result);
    }
  });

  test('distributes different ids across more than one palette entry', () => {
    const colors = new Set(
      Array.from({ length: 50 }, (_, index) => colorForUser(`user-${index}`).color),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
