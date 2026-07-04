import {
  BUILT_IN_INLINE_STYLES,
  isKnownInlineStyle,
  registerInlineStyle,
  resetCustomInlineStyles,
} from '@/lib/codemirror/inline-style-registry';

/**
 * Inline-style registry. The registry ships a built-in set of known AsciiDoc roles and
 * lets callers register custom ones WITHOUT a code change. `isKnownInlineStyle` answers whether a role
 * earns the distinct editor emphasis; an unknown name is still a perfectly valid role span (it is just
 * highlighted generically by the grammar, without the distinct emphasis).
 */
describe('inline-style registry', () => {
  afterEach(() => resetCustomInlineStyles());

  describe('built-in set', () => {
    test.each(['lead', 'underline', 'line-through', 'big', 'small'])(
      'ships the built-in AsciiDoc role %j',
      (role) => {
        expect(BUILT_IN_INLINE_STYLES.has(role)).toBe(true);
        expect(isKnownInlineStyle(role)).toBe(true);
      },
    );

    test('ships built-in colour roles', () => {
      expect(isKnownInlineStyle('red')).toBe(true);
      expect(isKnownInlineStyle('green')).toBe(true);
    });

    test('the built-in set is read-only (mutating it does not affect lookups)', () => {
      expect(() => (BUILT_IN_INLINE_STYLES as Set<string>).add('hacked')).not.toThrow();
      // Whether or not the underlying Set throws, the typed contract is ReadonlySet and the public
      // query path is isKnownInlineStyle — an unregistered name must not be known.
      expect(isKnownInlineStyle('totally-made-up')).toBe(false);
    });
  });

  describe('isKnownInlineStyle', () => {
    test('an unknown role is NOT known (but is still a valid role name)', () => {
      expect(isKnownInlineStyle('my-custom-role')).toBe(false);
    });

    test('matches case-insensitively', () => {
      expect(isKnownInlineStyle('LEAD')).toBe(true);
      expect(isKnownInlineStyle('Underline')).toBe(true);
    });

    test('trims surrounding whitespace', () => {
      expect(isKnownInlineStyle('  lead  ')).toBe(true);
    });
  });

  describe('registerInlineStyle (extensible without code change)', () => {
    test('a registered custom role becomes known', () => {
      expect(isKnownInlineStyle('fancy')).toBe(false);
      registerInlineStyle('fancy');
      expect(isKnownInlineStyle('fancy')).toBe(true);
    });

    test('registration is case-insensitive on lookup', () => {
      registerInlineStyle('MyRole');
      expect(isKnownInlineStyle('myrole')).toBe(true);
    });

    test('ignores blank names', () => {
      registerInlineStyle('   ');
      expect(isKnownInlineStyle('   ')).toBe(false);
    });

    test('does not mutate the built-in set', () => {
      const builtInSize = BUILT_IN_INLINE_STYLES.size;
      registerInlineStyle('extra');
      expect(BUILT_IN_INLINE_STYLES.has('extra')).toBe(false);
      expect(BUILT_IN_INLINE_STYLES.size).toBe(builtInSize);
    });
  });
});
