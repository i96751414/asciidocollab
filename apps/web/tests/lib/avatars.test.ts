import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE, AVATAR_VARIANT_SEEDS, INITIAL_FACE_EYE_VARIANTS } from '@/lib/avatars';

describe('DICEBEAR_STYLES', () => {
  test('initials and initial-face are distinct styles, not the same one', () => {
    expect(DICEBEAR_STYLES['initials']).toBeDefined();
    expect(DICEBEAR_STYLES['initial-face']).toBeDefined();
    expect(DICEBEAR_STYLES['initials'].style).not.toBe(DICEBEAR_STYLES['initial-face'].style);
  });

  test('initials has label "Initials"', () => {
    expect(DICEBEAR_STYLES['initials'].label).toBe('Initials');
  });

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

describe('DEFAULT_AVATAR_STYLE', () => {
  test('points at a style that exists in the catalogue', () => {
    expect(DICEBEAR_STYLES[DEFAULT_AVATAR_STYLE]).toBeDefined();
  });
});

describe('style variants', () => {
  test('initials has no variants (it is purely name-driven)', () => {
    expect(DICEBEAR_STYLES['initials'].variants).toBeUndefined();
  });

  test('every variant-bearing style offers 30 options', () => {
    for (const [key, entry] of Object.entries(DICEBEAR_STYLES)) {
      if (entry.variants) {
        expect(entry.variants).toHaveLength(30);
        expect(new Set(entry.variants.map((v) => v.id)).size).toBe(30); // ids are unique
      } else {
        expect(key).toBe('initials');
      }
    }
  });

  test('initial-face variants change the eye shape, eye colour and background but never the seed', () => {
    const variants = DICEBEAR_STYLES['initial-face'].variants!;
    for (const variant of variants) {
      expect(INITIAL_FACE_EYE_VARIANTS).toContain(variant.options.eyesVariant);
      expect(Array.isArray(variant.options.eyesColor)).toBe(true);
      expect(Array.isArray(variant.options.backgroundColor)).toBe(true);
      expect(variant.options).not.toHaveProperty('seed'); // initials stay name-driven
    }
    // Eye colours and backgrounds are all distinct, so the options don't look alike.
    const eyeColours = variants.map((v) => (v.options.eyesColor as string[])[0]);
    const backgrounds = variants.map((v) => (v.options.backgroundColor as string[])[0]);
    expect(new Set(eyeColours).size).toBe(eyeColours.length);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  test('random styles like bottts-neutral vary by seed', () => {
    for (const variant of DICEBEAR_STYLES['bottts-neutral'].variants!) {
      expect(variant.options).toEqual({ seed: variant.id });
    }
  });
});

describe('AVATAR_VARIANT_SEEDS', () => {
  test('has 30 entries', () => {
    expect(AVATAR_VARIANT_SEEDS).toHaveLength(30);
  });
});
