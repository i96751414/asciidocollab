import { parseListMarker } from '@/lib/codemirror/asciidoc-list-item';

/**
 * Pure-parser unit tests for `parseListMarker`. One assertion group per marker family plus
 * emptiness, indentation, and "not a list" negatives. Runs in the fast `node` Jest project.
 */
describe('parseListMarker — unordered', () => {
  test('single bullet `* x`', () => {
    expect(parseListMarker('* x')).toEqual({
      kind: 'unordered', indent: '', marker: '*', depth: 1, contentStart: 2, isEmpty: false, ordinal: null,
    });
  });

  test('dash bullet `- x` reuses `-`', () => {
    expect(parseListMarker('- x')).toEqual({
      kind: 'unordered', indent: '', marker: '-', depth: 1, contentStart: 2, isEmpty: false, ordinal: null,
    });
  });

  test('nested `** x` → depth 2', () => {
    const marker = parseListMarker('** x');
    expect(marker?.kind).toBe('unordered');
    expect(marker?.marker).toBe('**');
    expect(marker?.depth).toBe(2);
    expect(marker?.contentStart).toBe(3);
  });

  test('deep `*** x` → depth 3', () => {
    const marker = parseListMarker('*** x');
    expect(marker?.depth).toBe(3);
    expect(marker?.marker).toBe('***');
  });

  test('indentation preserved `  * x`', () => {
    const marker = parseListMarker('  * x');
    expect(marker?.indent).toBe('  ');
    expect(marker?.marker).toBe('*');
    expect(marker?.depth).toBe(1);
    expect(marker?.contentStart).toBe(4);
  });

  test('empty `* ` → isEmpty', () => {
    expect(parseListMarker('* ')?.isEmpty).toBe(true);
  });

  test('empty with trailing whitespace `*   ` → isEmpty', () => {
    expect(parseListMarker('*   ')?.isEmpty).toBe(true);
  });

  test('dash empty `- ` → isEmpty', () => {
    expect(parseListMarker('- ')?.isEmpty).toBe(true);
  });

  // ── Negatives ──────────────────────────────────────────────────────────────
  test('plain prose `hello` → null', () => {
    expect(parseListMarker('hello')).toBeNull();
  });

  test('inline bold `*bold*` → null (no space after marker)', () => {
    expect(parseListMarker('*bold*')).toBeNull();
  });

  test('block title `.Title` → null', () => {
    expect(parseListMarker('.Title')).toBeNull();
  });

  test('dash without space `-x` → null', () => {
    expect(parseListMarker('-x')).toBeNull();
  });

  test('open-block `--` → null', () => {
    expect(parseListMarker('--')).toBeNull();
  });
});

describe('parseListMarker — ordered', () => {
  test('implicit `. x` → depth 1, ordinal null', () => {
    expect(parseListMarker('. x')).toEqual({
      kind: 'ordered', indent: '', marker: '.', depth: 1, contentStart: 2, isEmpty: false, ordinal: null,
    });
  });

  test('implicit `.. x` → depth 2', () => {
    const marker = parseListMarker('.. x');
    expect(marker?.kind).toBe('ordered');
    expect(marker?.marker).toBe('..');
    expect(marker?.depth).toBe(2);
    expect(marker?.ordinal).toBeNull();
  });

  test('explicit `1. x` → ordinal 1, depth 1', () => {
    expect(parseListMarker('1. x')).toEqual({
      kind: 'ordered', indent: '', marker: '1.', depth: 1, contentStart: 3, isEmpty: false, ordinal: 1,
    });
  });

  test('explicit multi-digit `12. x` → ordinal 12', () => {
    const marker = parseListMarker('12. x');
    expect(marker?.ordinal).toBe(12);
    expect(marker?.marker).toBe('12.');
    expect(marker?.contentStart).toBe(4);
  });

  test('empty `. ` → isEmpty', () => {
    expect(parseListMarker('. ')?.isEmpty).toBe(true);
  });

  test('`....` (no trailing content) is a literal delimiter, not ordered → null', () => {
    expect(parseListMarker('....')).toBeNull();
  });
});

describe('parseListMarker — checklist', () => {
  test('`* [ ] x` → checklist, marker `*`', () => {
    const marker = parseListMarker('* [ ] x');
    expect(marker?.kind).toBe('checklist');
    expect(marker?.marker).toBe('*');
    expect(marker?.isEmpty).toBe(false);
  });

  test('`* [x] x` and `* [X] x` recognized as checklist (checked)', () => {
    expect(parseListMarker('* [x] x')?.kind).toBe('checklist');
    expect(parseListMarker('* [X] x')?.kind).toBe('checklist');
  });

  test('`- [ ] x` → checklist, marker `-`', () => {
    const marker = parseListMarker('- [ ] x');
    expect(marker?.kind).toBe('checklist');
    expect(marker?.marker).toBe('-');
  });

  test('`- [x] x` → checklist (dash, checked)', () => {
    const marker = parseListMarker('- [x] x');
    expect(marker?.kind).toBe('checklist');
    expect(marker?.marker).toBe('-');
  });

  test('checkbox-only `* [ ]` → isEmpty', () => {
    const marker = parseListMarker('* [ ]');
    expect(marker?.kind).toBe('checklist');
    expect(marker?.isEmpty).toBe(true);
  });

  test('checkbox-only `- [ ]` → isEmpty', () => {
    expect(parseListMarker('- [ ]')?.isEmpty).toBe(true);
  });
});

describe('parseListMarker — description', () => {
  test('term `CPU:: x` → marker `::`, not empty', () => {
    const marker = parseListMarker('CPU:: The brain');
    expect(marker?.kind).toBe('description');
    expect(marker?.marker).toBe('::');
    expect(marker?.isEmpty).toBe(false);
  });

  test('term `Term::: x` → marker `:::`', () => {
    expect(parseListMarker('Term::: x')?.marker).toBe(':::');
  });

  test('term `T:::: x` → marker `::::`', () => {
    expect(parseListMarker('T:::: x')?.marker).toBe('::::');
  });

  test('term `Term;; x` → marker `;;`', () => {
    const marker = parseListMarker('Term;; def');
    expect(marker?.kind).toBe('description');
    expect(marker?.marker).toBe(';;');
  });

  test('bare term `CPU::` (no inline definition) → not empty (continues)', () => {
    const marker = parseListMarker('CPU::');
    expect(marker?.kind).toBe('description');
    expect(marker?.isEmpty).toBe(false);
  });

  test('separator-only `:: ` → isEmpty (the exit case)', () => {
    const marker = parseListMarker(':: ');
    expect(marker?.kind).toBe('description');
    expect(marker?.isEmpty).toBe(true);
  });

  test('separator-only `;; ` → isEmpty', () => {
    expect(parseListMarker(';; ')?.isEmpty).toBe(true);
  });

  test('block-macro `image::a[]` → null (not a description item)', () => {
    expect(parseListMarker('image::a[]')).toBeNull();
  });

  // Code-review #4: the term must be a single (space-free) token so prose lines that merely
  // contain a mid-line `:: `/`;; ` are NOT mistaken for description items (and stay in lockstep
  // with the tokenizer, which only highlights single-token terms).
  test('prose with a mid-line `:: ` → null (not a description item)', () => {
    expect(parseListMarker('see the note:: really')).toBeNull();
  });

  test('prose with a mid-line `;; ` → null', () => {
    expect(parseListMarker('one two;; three')).toBeNull();
  });
});

describe('parseListMarker — deep nesting & edge cases', () => {
  test('deep unordered `**** x` → depth 4', () => {
    const marker = parseListMarker('**** x');
    expect(marker?.kind).toBe('unordered');
    expect(marker?.depth).toBe(4);
  });

  test('deep ordered `.... x` → depth 4 (4 dots + space, not a literal block)', () => {
    const marker = parseListMarker('.... x');
    expect(marker?.kind).toBe('ordered');
    expect(marker?.depth).toBe(4);
  });

  test('deep description `:::: x` → marker `::::`', () => {
    expect(parseListMarker('Term:::: x')?.marker).toBe('::::');
  });

  test('empty line `` → null', () => {
    expect(parseListMarker('')).toBeNull();
  });

  test('blank whitespace-only line `   ` → null', () => {
    expect(parseListMarker('   ')).toBeNull();
  });

  test('attached-block continuation `+` → null', () => {
    expect(parseListMarker('+')).toBeNull();
  });
});
