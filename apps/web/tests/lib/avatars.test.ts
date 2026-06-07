// Mock the ESM dicebear package before importing the module under test
jest.mock('@dicebear/collection', () => ({
  initials: 'initials-style',
  bottts: 'bottts-style',
  pixelArt: 'pixelArt-style',
  funEmoji: 'funEmoji-style',
  lorelei: 'lorelei-style',
  adventurer: 'adventurer-style',
  shapes: 'shapes-style',
  identicon: 'identicon-style',
}));

import { DICEBEAR_STYLES, AVATAR_VARIANT_SEEDS } from '@/lib/avatars';

describe('DICEBEAR_STYLES', () => {
  test('initial-face has label "Initial Face"', () => {
    expect(DICEBEAR_STYLES['initial-face'].label).toBe('Initial Face');
  });

  test('lorelei is defined with a style', () => {
    expect(DICEBEAR_STYLES['lorelei']).toBeDefined();
    expect(DICEBEAR_STYLES['lorelei'].style).toBeDefined();
  });

  test('adventurer is defined with a style', () => {
    expect(DICEBEAR_STYLES['adventurer']).toBeDefined();
    expect(DICEBEAR_STYLES['adventurer'].style).toBeDefined();
  });

  test('lorelei has backgroundColor options so it renders visibly', () => {
    expect(DICEBEAR_STYLES['lorelei'].options).toMatchObject({
      backgroundColor: expect.any(Array),
    });
  });

  test('adventurer has backgroundColor options so it renders visibly', () => {
    expect(DICEBEAR_STYLES['adventurer'].options).toMatchObject({
      backgroundColor: expect.any(Array),
    });
  });
});

describe('AVATAR_VARIANT_SEEDS', () => {
  test('has at least 16 entries to give users a broad preview', () => {
    expect(AVATAR_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(16);
  });
});
