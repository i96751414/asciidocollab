// Mock the ESM dicebear package before importing the module under test
jest.mock('@dicebear/collection', () => ({
  initials: 'initials-style',
  botttsNeutral: 'botttsNeutral-style',
  pixelArt: 'pixelArt-style',
  funEmoji: 'funEmoji-style',
  lorelei: 'lorelei-style',
  adventurerNeutral: 'adventurerNeutral-style',
  shapes: 'shapes-style',
  identicon: 'identicon-style',
}));

import { DICEBEAR_STYLES, AVATAR_VARIANT_SEEDS } from '@/lib/avatars';

describe('DICEBEAR_STYLES', () => {
  test('initial-face has label "Initial Face"', () => {
    expect(DICEBEAR_STYLES['initial-face'].label).toBe('Initial Face');
  });

  test('bottts-neutral is defined with a style', () => {
    expect(DICEBEAR_STYLES['bottts-neutral']).toBeDefined();
    expect(DICEBEAR_STYLES['bottts-neutral'].style).toBeDefined();
  });

  test('adventurer-neutral is defined with a style', () => {
    expect(DICEBEAR_STYLES['adventurer-neutral']).toBeDefined();
    expect(DICEBEAR_STYLES['adventurer-neutral'].style).toBeDefined();
  });

  test('bottts (old key) is no longer in DICEBEAR_STYLES', () => {
    expect(DICEBEAR_STYLES['bottts']).toBeUndefined();
  });

  test('adventurer (old key) is no longer in DICEBEAR_STYLES', () => {
    expect(DICEBEAR_STYLES['adventurer']).toBeUndefined();
  });

  test('lorelei is defined with a style', () => {
    expect(DICEBEAR_STYLES['lorelei']).toBeDefined();
    expect(DICEBEAR_STYLES['lorelei'].style).toBeDefined();
  });

  test('lorelei has backgroundColor options so it renders visibly', () => {
    expect(DICEBEAR_STYLES['lorelei'].options).toMatchObject({
      backgroundColor: expect.any(Array),
    });
  });

  test('adventurer-neutral has backgroundColor options so it renders visibly', () => {
    expect(DICEBEAR_STYLES['adventurer-neutral'].options).toMatchObject({
      backgroundColor: expect.any(Array),
    });
  });
});

describe('AVATAR_VARIANT_SEEDS', () => {
  test('has at least 16 entries to give users a broad preview', () => {
    expect(AVATAR_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(16);
  });
});
