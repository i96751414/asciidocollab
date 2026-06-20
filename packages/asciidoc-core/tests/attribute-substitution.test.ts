import { substitutePathAttributes } from '../src/attribute-substitution';

const attributes = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('substitutePathAttributes', () => {
  test('replaces a known {name} with its value (case-insensitive)', () => {
    expect(substitutePathAttributes('{Partsdir}/intro.adoc', attributes({ partsdir: 'chapters' }))).toBe('chapters/intro.adoc');
  });

  test('leaves an unknown reference verbatim', () => {
    expect(substitutePathAttributes('{missing}/x', attributes({}))).toBe('{missing}/x');
  });

  test('resolves nested references across passes', () => {
    expect(substitutePathAttributes('{a}/x', attributes({ a: '{b}', b: 'deep' }))).toBe('deep/x');
  });

  test('a self-referential value terminates at maxDepth instead of looping', () => {
    // `{a}` → `{a}` never settles; bounded passes return without hanging.
    expect(substitutePathAttributes('{a}', attributes({ a: '{a}' }), 3)).toBe('{a}');
  });

  test('returns the target unchanged when there are no references', () => {
    expect(substitutePathAttributes('plain/path.adoc', attributes({ a: '1' }))).toBe('plain/path.adoc');
  });

  test('leaves a backslash-escaped reference verbatim (AsciiDoc escape semantics)', () => {
    expect(substitutePathAttributes(String.raw`\{foo}`, attributes({ foo: 'bar' }))).toBe(String.raw`\{foo}`);
  });

  test('substitutes an unescaped reference on the same line as an escaped one', () => {
    expect(substitutePathAttributes(String.raw`\{foo} and {foo}`, attributes({ foo: 'bar' }))).toBe(String.raw`\{foo} and bar`);
  });
});
