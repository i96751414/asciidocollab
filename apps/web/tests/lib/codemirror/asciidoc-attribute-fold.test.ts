import { computeAttributeReplacements } from '@/lib/codemirror/asciidoc-attribute-fold';

describe('computeAttributeReplacements (FR-057)', () => {
  test('collapses a reference to an attribute defined earlier', () => {
    const source = ':version: 1.2.3\n\nRelease {version} now.\n';
    const [replacement] = computeAttributeReplacements(source);
    expect(replacement.value).toBe('1.2.3');
    expect(source.slice(replacement.from, replacement.to)).toBe('{version}');
  });

  test('ignores forward references (defined later)', () => {
    const source = 'See {version}.\n\n:version: 9\n';
    expect(computeAttributeReplacements(source)).toHaveLength(0);
  });

  test('ignores unknown attributes', () => {
    expect(computeAttributeReplacements('Use {missing} here.\n')).toHaveLength(0);
  });

  test(':name!: unsets the attribute', () => {
    const source = ':x: 1\n:x!:\nValue {x}.\n';
    expect(computeAttributeReplacements(source)).toHaveLength(0);
  });

  test('resolves nested references inside attribute values', () => {
    const source = ':first: Jane\n:full: {first} Doe\n\nHello {full}.\n';
    const replacement = computeAttributeReplacements(source).find((entry) => entry.value.includes('Jane'));
    expect(replacement?.value).toBe('Jane Doe');
  });

  test('does not modify the document (offsets map back to the raw reference)', () => {
    const source = ':a: X\n{a} and {a}\n';
    const replacements = computeAttributeReplacements(source);
    expect(replacements).toHaveLength(2);
    for (const replacement of replacements) {
      expect(source.slice(replacement.from, replacement.to)).toBe('{a}');
    }
  });
});
