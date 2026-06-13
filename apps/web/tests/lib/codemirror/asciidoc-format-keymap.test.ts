import { wrapWith, AUTO_WRAP_MARKS, formatKeymap } from '@/lib/codemirror/asciidoc-format-keymap';

describe('wrapWith (FR-036/037)', () => {
  test('wraps a selection in the mark and selects the inner text', () => {
    const { insert, innerFrom, innerTo } = wrapWith('word', '*');
    expect(insert).toBe('*word*');
    expect(insert.slice(innerFrom, innerTo)).toBe('word');
  });
  test('uses the placeholder when the selection is empty', () => {
    expect(wrapWith('', '_', 'italic').insert).toBe('_italic_');
  });
});

describe('AUTO_WRAP_MARKS (FR-037)', () => {
  test('includes the AsciiDoc emphasis marks', () => {
    for (const mark of ['*', '_', '`']) expect(AUTO_WRAP_MARKS.has(mark)).toBe(true);
  });
});

describe('formatKeymap (FR-041)', () => {
  test('binds Mod-b/i/` and Mod-/ without touching save/find/undo', () => {
    const keys = formatKeymap.map((binding) => binding.key);
    expect(keys).toEqual(['Mod-b', 'Mod-i', 'Mod-`', 'Mod-/']);
    expect(keys).not.toContain('Mod-s');
    expect(keys).not.toContain('Mod-z');
    expect(keys).not.toContain('Mod-f');
  });
});
