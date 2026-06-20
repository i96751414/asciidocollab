import { assembleIncludes } from '@/workers/assemble-includes';

function reader(files: Record<string, string>) {
  return (path: string) => files[path] ?? null;
}

// ── T009 (US1): show-mode regression / equivalence guard ──────────────────────────────────────
// These tests confirm that `showIncludes: true` (and the default / no-option call) produces
// byte-identical assembled output to the pre-feature behavior for representative inputs.
// They MUST PASS now (the assembler already inlines everything) and MUST CONTINUE TO PASS after
// T012 adds the `showIncludes` option — they are the regression barrier that ensures the default
// behavior is not accidentally changed by the hide-mode implementation.
describe('assembleIncludes — show-mode regression / equivalence (T009)', () => {
  test('showIncludes: true produces the same output as calling without options (equivalence)', () => {
    // A file with a real include: both call-styles must agree byte-for-byte.
    const files = {
      'root.adoc': '= Book\n\ninclude::chapter.adoc[]\n',
      'chapter.adoc': '== Chapter One\n\nSome prose.\n',
    };
    const withOption = assembleIncludes('root.adoc', reader(files), { showIncludes: true } as never);
    const withDefault = assembleIncludes('root.adoc', reader(files));
    expect(withOption.content).toBe(withDefault.content);
    expect(withOption.unresolved).toEqual(withDefault.unresolved);
  });

  test('showIncludes: true inlines the included body — pre-feature byte-identity (representative input)', () => {
    // root.adoc defines an attribute `:product: Acme`, includes a child that adds prose and uses
    // the attribute, and has a paragraph after the include.  With showIncludes:true the assembled
    // output must contain the included prose and the attribute entry, and must NOT contain any
    // placeholder marker (regression guard against FR-003b leaking into show mode).
    const files = {
      'root.adoc':
        '= Manual\n\n:product: Acme\n\ninclude::intro.adoc[]\n\nSee {product} documentation.\n',
      'intro.adoc': ':edition: 2\n\n== Introduction\n\nWelcome to Acme.\n',
    };
    const { content, unresolved } = assembleIncludes('root.adoc', reader(files), {
      showIncludes: true,
    } as never);

    // The included prose is present.
    expect(content).toContain('== Introduction');
    expect(content).toContain('Welcome to Acme.');
    // The attribute entry from the included file is present (verbatim, for Asciidoctor).
    expect(content).toContain(':edition: 2');
    // No include:: directives remain.
    expect(content).not.toContain('include::');
    // No placeholder markup (show mode must never emit a placeholder).
    expect(content).not.toContain('adoc-include-placeholder');
    expect(content).not.toContain('++++');
    // No unresolved entries for a cleanly resolved include.
    expect(unresolved).toEqual([]);
  });

  test('an include-free document assembles to itself byte-for-byte under any showIncludes value (FR-014)', () => {
    // Scroll-sync no-regression: when no include:: directives exist, the output must equal the
    // input regardless of the showIncludes option.  Even unrelated option values must not corrupt
    // an include-free document.
    const source = '= Title\n\n== Section One\n\nText with a colon: value.\n\n=== Sub\n\nMore text.\n';
    const files = { 'doc.adoc': source };

    // No options (default).
    const { content: defaultContent, unresolved: defaultUnresolved } = assembleIncludes(
      'doc.adoc',
      reader(files),
    );
    expect(defaultContent).toBe(source);
    expect(defaultUnresolved).toEqual([]);

    // showIncludes: true (explicit).
    const { content: showContent, unresolved: showUnresolved } = assembleIncludes(
      'doc.adoc',
      reader(files),
      { showIncludes: true } as never,
    );
    expect(showContent).toBe(source);
    expect(showUnresolved).toEqual([]);

    // showIncludes: false — still no includes to process, so output must equal input.
    const { content: hideContent, unresolved: hideUnresolved } = assembleIncludes(
      'doc.adoc',
      reader(files),
      { showIncludes: false } as never,
    );
    expect(hideContent).toBe(source);
    expect(hideUnresolved).toEqual([]);
  });

  test('mixed: file with includes — showIncludes: true matches calling without options', () => {
    // A slightly richer document: root includes two children, one of which is conditional.
    // showIncludes:true must produce the same result as calling with no options.
    const files = {
      'main.adoc': ':flag:\n\ninclude::part-a.adoc[]\n\nifdef::flag[]\ninclude::part-b.adoc[]\nendif::[]\n',
      'part-a.adoc': '== Part A\n\nContent A.\n',
      'part-b.adoc': '== Part B\n\nContent B (conditional).\n',
    };
    const withShow = assembleIncludes('main.adoc', reader(files), { showIncludes: true } as never);
    const withDefault = assembleIncludes('main.adoc', reader(files));

    expect(withShow.content).toBe(withDefault.content);
    expect(withShow.content).toContain('== Part A');
    expect(withShow.content).toContain('== Part B');
    expect(withShow.unresolved).toEqual(withDefault.unresolved);
  });
});
