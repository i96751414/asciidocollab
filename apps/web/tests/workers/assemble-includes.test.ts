import { assembleIncludes } from '@/workers/assemble-includes';

function reader(files: Record<string, string>) {
  return (path: string) => files[path] ?? null;
}

describe('assembleIncludes — sandbox-gated include assembly (US8/FR-068, Constitution IX)', () => {
  test('inlines a resolvable sibling include', () => {
    const files = {
      'main.adoc': '= Book\n\ninclude::chapter.adoc[]\n',
      'chapter.adoc': '== Chapter\n\nBody.\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('== Chapter');
    expect(content).toContain('Body.');
    expect(content).not.toContain('include::');
    expect(unresolved).toEqual([]);
  });

  test('assembles transitively (nested includes)', () => {
    const files = {
      'main.adoc': 'include::a.adoc[]\n',
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).not.toContain('include::');
  });

  test('rejects a parent-traversal target without reading it (Constitution IX)', () => {
    const reads: string[] = [];
    const read = (path: string) => {
      reads.push(path);
      return ({ 'main.adoc': 'include::../secret.adoc[]\n' } as Record<string, string>)[path] ?? null;
    };
    const { content, unresolved } = assembleIncludes('main.adoc', read);
    expect(content).toContain('Unresolved directive');
    expect(reads).not.toContain('../secret.adoc');
    expect(unresolved[0]).toMatchObject({ target: '../secret.adoc', reason: 'traversal' });
  });

  test('rejects an absolute target', () => {
    const files = { 'main.adoc': 'include::/etc/passwd[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ reason: 'absolute' });
  });

  test('rejects a remote target', () => {
    const files = { 'main.adoc': 'include::https://evil.example/x.adoc[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ reason: 'remote' });
  });

  test('rejects a percent-encoded traversal (double-decode guard)', () => {
    const files = { 'main.adoc': 'include::%2e%2e/secret.adoc[]\n' };
    const { unresolved, content } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('Unresolved directive');
    expect(unresolved).toHaveLength(1);
  });

  test('guards against include cycles', () => {
    const files = {
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\ninclude::a.adoc[]\n',
    };
    const { content, unresolved } = assembleIncludes('a.adoc', reader(files));
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(unresolved.some((u) => u.reason === 'cycle')).toBe(true);
  });

  test('marks a missing (but in-sandbox) target as unresolved', () => {
    const files = { 'main.adoc': 'include::gone.adoc[]\n' };
    const { unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(unresolved[0]).toMatchObject({ target: 'gone.adoc', reason: 'not-found' });
  });

  test('wraps an include with a leveloffset attribute in an absolute :leveloffset: set/restore', () => {
    const files = {
      'main.adoc': 'include::ch.adoc[leveloffset=+1]\n',
      'ch.adoc': '== Section\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    // The boundary sets the child's absolute offset (1) and restores the parent's absolute offset (0)
    // after the child, so an unbalanced child cannot corrupt the surrounding offset (FR-010).
    expect(content).toContain(':leveloffset: 1');
    expect(content).toContain('== Section');
    expect(content).toContain(':leveloffset: 0');
    const setIndex = content.indexOf(':leveloffset: 1');
    const sectionIndex = content.indexOf('== Section');
    const restoreIndex = content.indexOf(':leveloffset: 0');
    expect(sectionIndex).toBeGreaterThan(setIndex);
    expect(restoreIndex).toBeGreaterThan(sectionIndex);
  });

  test('attribute-form :leveloffset: in a child persists into the parent and sibling includes', () => {
    // Asciidoctor semantics: `:leveloffset: +2` SET INSIDE an included file (attribute form) persists
    // after the include ends — it is NOT scoped to the include. Only the `leveloffset=` OPTION on the
    // include directive is include-scoped. So the second sibling is reached with offset=2, not 0.
    const files = {
      'main.adoc': 'include::first.adoc[]\n\ninclude::second.adoc[]\n',
      'first.adoc': ':leveloffset: +2\n\n== In First\n',
      'second.adoc': '== In Second\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    const firstHeading = content.indexOf('== In First');
    const secondHeading = content.indexOf('== In Second');
    expect(firstHeading).toBeGreaterThan(-1);
    expect(secondHeading).toBeGreaterThan(firstHeading);
    // No restore is emitted between the two includes — the attribute-form change persists.
    expect(content.slice(firstHeading, secondHeading)).not.toContain(':leveloffset: 0');
  });

  test(':leveloffset: option form is scoped but attribute form in a child persists to parent body', () => {
    // Regression for: `:leveloffset: +10` in an included document not considered in the preview.
    // When a child sets leveloffset with the ATTRIBUTE FORM (`:leveloffset: +N`), the change must
    // persist into the parent body after the include. The OPTION FORM (`include::[leveloffset=+N]`)
    // is still scoped (only wraps the child's content) — the two forms are treated differently.
    const files = {
      'main.adoc': '= Main\ninclude::child.adoc[]\n== After Include\n',
      'child.adoc': ':leveloffset: +1\n== Child Heading\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    // Attribute-form change persists: no `:leveloffset: 0` restore emitted after the child.
    const childIndex = content.indexOf('== Child Heading');
    const afterIndex = content.indexOf('== After Include');
    expect(content.slice(childIndex, afterIndex)).not.toContain(':leveloffset: 0');
    // Option form: still scoped — wraps the child.
    const files2 = {
      'main.adoc': '= Main\ninclude::child.adoc[leveloffset=+1]\n== After Include\n',
      'child.adoc': '== Child Heading\n',
    };
    const { content: content2 } = assembleIncludes('main.adoc', reader(files2));
    expect(content2).toContain(':leveloffset: 1');
    expect(content2).toContain(':leveloffset: 0');
    const set2 = content2.indexOf(':leveloffset: 1');
    const restore2 = content2.indexOf(':leveloffset: 0');
    expect(restore2).toBeGreaterThan(set2);
  });

  test('the prefix-unset form `:!leveloffset:` resets the running offset (like `:leveloffset!:`)', () => {
    // Asciidoctor accepts both `:leveloffset!:` and `:!leveloffset:` to unset; the assembler must treat
    // the prefix form as a reset too, so it agrees with the editor's effective-offset walk.
    const files = {
      'main.adoc': ':leveloffset: +2\n:!leveloffset:\n\ninclude::ch.adoc[leveloffset=+1]\n',
      'ch.adoc': '== Heading\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files));
    // After the reset the running offset is 0, so the include applies just its own +1 (not 2+1=3).
    expect(content).toContain(':leveloffset: 1');
    expect(content).not.toContain(':leveloffset: 3');
  });

  test('substitutes an attribute defined before the include directive in its target', () => {
    const files = {
      'main.adoc': ':partsdir: parts\n\ninclude::{partsdir}/x.adoc[]\n',
      'parts/x.adoc': '= X\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('= X');
    expect(unresolved).toEqual([]);
  });

  test('does not substitute an attribute defined after the include that uses it (document order)', () => {
    const files = {
      'main.adoc': 'include::{partsdir}/x.adoc[]\n\n:partsdir: parts\n',
      'parts/x.adoc': '= X\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    // The attribute is not yet in scope at the include, so the target stays literal and is not read,
    // matching extraction.ts (the editor would flag the same include as Unresolved).
    expect(content).not.toContain('= X');
    expect(unresolved.some((u) => u.target === '{partsdir}/x.adoc')).toBe(true);
  });

  test('a child include can use an attribute its parent defined before the include (inherited scope)', () => {
    const files = {
      'main.adoc': ':partsdir: parts\n\ninclude::child.adoc[]\n',
      'child.adoc': 'include::{partsdir}/y.adoc[]\n',
      'parts/y.adoc': '= Y\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('= Y');
    expect(unresolved).toEqual([]);
  });

  test('respects a maxDepth bound', () => {
    const files = {
      'a.adoc': 'A\ninclude::b.adoc[]\n',
      'b.adoc': 'B\ninclude::c.adoc[]\n',
      'c.adoc': 'C\n',
    };
    const { content, unresolved } = assembleIncludes('a.adoc', reader(files), { maxDepth: 1 });
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).not.toContain('C');
    expect(unresolved.some((u) => u.reason === 'depth')).toBe(true);
  });

  test('caps total include expansions (fan-out DoS): once the budget is spent, further includes are gated as "limit"', () => {
    // The ancestor-chain cycle guard does NOT stop a file re-included many times (a diamond/fan-out),
    // so a malicious project can force exponential re-expansion and OOM the worker. A global expansion
    // budget bounds the total work regardless of shape.
    const files = {
      'main.adoc': 'include::leaf.adoc[]\n'.repeat(200),
      'leaf.adoc': 'x\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), { maxExpansions: 50 });
    // The first 50 expand; the rest are refused with a dedicated reason and never read further.
    expect(unresolved.some((u) => u.reason === 'limit')).toBe(true);
    expect(content).toContain('x');
  });

  test('not-found includes do NOT consume the expansion budget (only real expansions count)', () => {
    // A document referencing missing/optional partials must not exhaust the fan-out budget on reads
    // that expand nothing — otherwise a later VALID include is wrongly gated as "limit" (#6).
    const files = {
      'main.adoc': 'include::missing1.adoc[]\ninclude::missing2.adoc[]\ninclude::real.adoc[]\n',
      'real.adoc': 'REAL BODY\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), { maxExpansions: 1 });
    expect(content).toContain('REAL BODY'); // the one real include still expands within the budget
    expect(unresolved.filter((u) => u.reason === 'not-found')).toHaveLength(2);
    expect(unresolved.some((u) => u.reason === 'limit')).toBe(false);
  });

  test('a deep doubling include chain terminates (bounded) instead of expanding 2^depth times', () => {
    // f0 includes f1 twice, f1 includes f2 twice, … — without a global cap this is 2^depth expansions.
    const files: Record<string, string> = {};
    const depth = 60;
    for (let level = 0; level < depth; level += 1) {
      files[`f${level}.adoc`] = `include::f${level + 1}.adoc[]\ninclude::f${level + 1}.adoc[]\n`;
    }
    files[`f${depth}.adoc`] = 'leaf\n';
    const { unresolved } = assembleIncludes('f0.adoc', reader(files), { maxExpansions: 500 });
    // It returns (does not hang/OOM) and reports the budget being hit.
    expect(unresolved.some((u) => u.reason === 'limit')).toBe(true);
  });

  test('leaves a document with no includes byte-identical (scroll-sync regression, Constitution VIII)', () => {
    const source = '= Title\n\n== One\n\nText with a colon: value.\n\n=== Two\n';
    const { content, unresolved } = assembleIncludes('main.adoc', reader({ 'main.adoc': source }));
    expect(content).toBe(source);
    expect(unresolved).toEqual([]);
  });

  // Same as above but with showIncludes:false (hide mode) — the scroll-sync regression guard must
  // also hold when the assembler runs with hideMode=true (029 enables this for ALL standalone files).
  test('leaves a document with no includes byte-identical in hide mode (scroll-sync regression, 029)', () => {
    const fillerParagraphs = Array.from({ length: 20 }, (_, index) =>
      [`Filler paragraph ${index + 1} with enough text to generate rendered height.`, ''],
    ).flat();
    const lines = [
      '= First Section',
      '',
      'Paragraph in the first section.',
      '',
      ...fillerParagraphs,
      '== Second Section',
      '',
      'Content of the second section.',
    ];
    const source = lines.join('\n') + '\n';
    const { content, unresolved } = assembleIncludes('main.adoc', reader({ 'main.adoc': source }), {
      showIncludes: false,
    });
    expect(content).toBe(source);
    expect(unresolved).toEqual([]);
  });

  // T015 (FR-005): an unset before the include removes the attribute, so a later include target
  // using it is no longer substituted (and the target is left literal / unresolved).
  test('an unset attribute before an include is not substituted in a later include target', () => {
    const files = {
      'main.adoc': ':partsdir: parts\n:partsdir!:\n\ninclude::{partsdir}/x.adoc[]\n',
      'parts/x.adoc': '= X\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).not.toContain('= X');
    expect(unresolved.some((u) => u.target === '{partsdir}/x.adoc')).toBe(true);
  });

  // T015 (FR-040): an inline {set:} before an include defines an attribute used by a later target.
  test('an inline {set:} before an include is substituted in a later include target', () => {
    const files = {
      'main.adoc': 'Intro {set:partsdir:parts}\n\ninclude::{partsdir}/x.adoc[]\n',
      'parts/x.adoc': '= X\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
    expect(content).toContain('= X');
    expect(unresolved).toEqual([]);
  });

  test('a missing root yields empty content and a not-found entry', () => {
    const { content, unresolved } = assembleIncludes('nope.adoc', reader({}));
    expect(content).toBe('');
    expect(unresolved[0]).toMatchObject({ target: 'nope.adoc', reason: 'not-found' });
  });

  // ── T045 (US11/FR-040..FR-041): inline {set:} and wrapped attribute values in the assembler ──
  // The assembler tracks attribute state per line via applyLineAttributes; an inline {set:} affects
  // subsequent (incl. cross-include) references, and a trailing-`\` wrapped attribute entry must be
  // JOINED so the full multi-line value is tracked (applyLineAttributes does not join continuation
  // lines, so the assembler joins them before tracking). Source lines stay intact for Asciidoctor.
  describe('inline {set:} and wrapped attribute values (US11)', () => {
    test('an inline {set:} value is in scope for a later include target across the tree', () => {
      const files = {
        'main.adoc': 'Intro {set:basedir:src/main/java}\n\ninclude::{basedir}/x.adoc[]\n',
        'src/main/java/x.adoc': '= X\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('= X');
      expect(unresolved).toEqual([]);
    });

    test('an inline {set:name!} unset removes the attribute from a later include target', () => {
      const files = {
        'main.adoc': '{set:basedir:parts}\n{set:basedir!}\n\ninclude::{basedir}/x.adoc[]\n',
        'parts/x.adoc': '= X\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).not.toContain('= X');
      expect(unresolved.some((u) => u.target === '{basedir}/x.adoc')).toBe(true);
    });

    test('a trailing-`\\` wrapped attribute value is joined so the full value resolves in an include target', () => {
      const files = {
        // The value spans two lines via the trailing `\`; the joined value `src main` (continuation
        // joined with a single space, mirroring the resolution model) becomes the include base.
        // Without joining, only `src` would be tracked and the target would miss.
        'main.adoc': ':basedir: src \\\nmain\n\ninclude::{basedir}/x.adoc[]\n',
        'src main/x.adoc': '= X\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('= X');
      expect(unresolved).toEqual([]);
    });

    test('a wrapped attribute entry leaves its physical source lines intact for Asciidoctor', () => {
      const source = ':longval: first \\\nsecond\n\nBody {longval}.\n';
      const { content } = assembleIncludes('main.adoc', reader({ 'main.adoc': source }));
      // The assembler joins the value only for its OWN tracking; the emitted source is byte-identical
      // so Asciidoctor performs the native continuation join and source-line mapping is preserved.
      expect(content).toBe(source);
    });

    test('a wrapped attribute defined in a parent is in scope for a child include target', () => {
      const files = {
        'main.adoc': ':basedir: src \\\nmain\n\ninclude::child.adoc[]\n',
        'child.adoc': 'include::{basedir}/y.adoc[]\n',
        'src main/y.adoc': '= Y\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('= Y');
      expect(unresolved).toEqual([]);
    });
  });

  // ── T039 (US8/FR-029..FR-031): conditional include-gating in the assembler ──────────────────
  // The assembler gates ONLY includes against the resolved document-order attribute state. It does
  // not strip content-level conditionals — those (and the directive lines themselves) are left in
  // the assembled source for Asciidoctor to evaluate natively with the seeded attributes.
  describe('conditional include-gating (US8)', () => {
    test('ifdef::flag[] gates a wrapped include — assembled when the flag is set', () => {
      const files = {
        'main.adoc': ':flag:\n\nifdef::flag[]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== Chapter Body\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('== Chapter Body');
      // Directive lines are left in the source for Asciidoctor (content-level handling).
      expect(content).toContain('ifdef::flag[]');
      expect(content).toContain('endif::[]');
      expect(unresolved).toEqual([]);
    });

    test('ifdef::flag[] gates a wrapped include — SKIPPED when the flag is unset', () => {
      const reads: string[] = [];
      const read = (path: string) => {
        reads.push(path);
        return ({
          'main.adoc': 'ifdef::flag[]\ninclude::ch.adoc[]\nendif::[]\n',
          'ch.adoc': '== Chapter Body\n',
        } as Record<string, string>)[path] ?? null;
      };
      const { content, unresolved } = assembleIncludes('main.adoc', read);
      // The include inside an inactive branch is NOT expanded — the child is never read.
      expect(content).not.toContain('== Chapter Body');
      expect(reads).not.toContain('ch.adoc');
      // The directive lines AND the (un-expanded) include line stay in the source.
      expect(content).toContain('ifdef::flag[]');
      expect(content).toContain('endif::[]');
      expect(unresolved).toEqual([]);
    });

    test('ifndef::flag[] is the inverse — assembled when the flag is unset, skipped when set', () => {
      const ch = '== Chapter Body\n';
      const unsetResult = assembleIncludes(
        'main.adoc',
        reader({ 'main.adoc': 'ifndef::flag[]\ninclude::ch.adoc[]\nendif::[]\n', 'ch.adoc': ch }),
      );
      expect(unsetResult.content).toContain('== Chapter Body');

      const setResult = assembleIncludes(
        'main.adoc',
        reader({ 'main.adoc': ':flag:\n\nifndef::flag[]\ninclude::ch.adoc[]\nendif::[]\n', 'ch.adoc': ch }),
      );
      expect(setResult.content).not.toContain('== Chapter Body');
    });

    test('an empty/unparseable ifeval region does not desync the conditional stack (its endif must not pop an outer region)', () => {
      // `ifeval::[]` matches the region-opener shape but has no parseable expression. It must still
      // open (and balance) exactly one region; otherwise its `endif::[]` pops the enclosing
      // `ifdef::flag[]` region, leaving the later include ungated even though `flag` is undefined.
      const reads: string[] = [];
      const read = (path: string) => {
        reads.push(path);
        return ({
          'main.adoc': 'ifdef::flag[]\nifeval::[]\nendif::[]\ninclude::ch.adoc[]\nendif::[]\n',
          'ch.adoc': '== Should Stay Gated\n',
        } as Record<string, string>)[path] ?? null;
      };
      const { content } = assembleIncludes('main.adoc', read);
      // `flag` is undefined, so the outer region is inactive and the include must NOT be expanded.
      expect(content).not.toContain('== Should Stay Gated');
      expect(reads).not.toContain('ch.adoc');
    });

    test('ifeval::[expr] gates a wrapped include against numeric attribute state', () => {
      const files = {
        'main.adoc': ':edition: 2\n\nifeval::[{edition} >= 2]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== Edition Two\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('== Edition Two');

      const skipped = assembleIncludes(
        'main.adoc',
        reader({ ...files, 'main.adoc': ':edition: 1\n\nifeval::[{edition} >= 2]\ninclude::ch.adoc[]\nendif::[]\n' }),
      );
      expect(skipped.content).not.toContain('== Edition Two');
    });

    test('single-line form ifdef::flag[include::target[]] gates the inline include', () => {
      const files = {
        'main.adoc': ':flag:\n\nifdef::flag[include::ch.adoc[]]\n',
        'ch.adoc': '== Inline Gated\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('== Inline Gated');

      const skipped = assembleIncludes(
        'main.adoc',
        reader({ ...files, 'main.adoc': 'ifdef::flag[include::ch.adoc[]]\n' }),
      );
      expect(skipped.content).not.toContain('== Inline Gated');
    });

    test('nested conditionals — the include is active only when ALL enclosing regions are active', () => {
      const files = {
        'main.adoc':
          ':a:\n:b:\n\nifdef::a[]\nifdef::b[]\ninclude::ch.adoc[]\nendif::[]\nendif::[]\n',
        'ch.adoc': '== Deeply Nested\n',
      };
      expect(assembleIncludes('main.adoc', reader(files)).content).toContain('== Deeply Nested');

      // Inner region inactive (b unset) ⇒ the include is skipped even though the outer is active.
      const inner = assembleIncludes(
        'main.adoc',
        reader({ ...files, 'main.adoc': ':a:\n\nifdef::a[]\nifdef::b[]\ninclude::ch.adoc[]\nendif::[]\nendif::[]\n' }),
      );
      expect(inner.content).not.toContain('== Deeply Nested');
    });

    test('content-level conditionals (wrapping plain text, not an include) pass through unchanged', () => {
      const source = '= Doc\n\nifdef::draft[]\nDRAFT WATERMARK\nendif::[]\n\nVisible body.\n';
      const { content, unresolved } = assembleIncludes('main.adoc', reader({ 'main.adoc': source }));
      // No include is involved, so the assembler must leave the source byte-identical for Asciidoctor.
      expect(content).toBe(source);
      expect(unresolved).toEqual([]);
    });

    test('an unbalanced stray endif does not crash and leaves the rest of the doc intact', () => {
      const files = {
        'main.adoc': 'endif::[]\n\ninclude::ch.adoc[]\n',
        'ch.adoc': '== Still Included\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      // A stray endif pops nothing; the later include (outside any region) still resolves.
      expect(content).toContain('== Still Included');
      expect(content).toContain('endif::[]');
    });

    test('an unclosed if only affects includes that follow it, within the same branch', () => {
      const files = {
        'main.adoc': 'ifdef::missing[]\ninclude::ch.adoc[]\n',
        'ch.adoc': '== Gated Off\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      // The region never closes, but since `missing` is undefined the include is skipped; no crash.
      expect(content).not.toContain('== Gated Off');
      expect(content).toContain('ifdef::missing[]');
    });

    test('a single-line ifdef with INLINE TEXT (not an include) is not a region — later includes still expand', () => {
      // `ifdef::draft[Some text]` is the single-line content form, NOT a region opener; it has no
      // matching endif. It must be left verbatim for Asciidoctor and must NOT open an unbalanced
      // region that silently gates off every subsequent include.
      const files = {
        'main.adoc': 'ifdef::draft[Draft note.]\n\ninclude::ch.adoc[]\n',
        'ch.adoc': '== Real Chapter\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('ifdef::draft[Draft note.]'); // left for Asciidoctor
      expect(content).toContain('== Real Chapter'); // the include is NOT gated off
    });

    test('an active outer region still gates by a later attribute change in document order', () => {
      // The flag is set, then unset before the conditional, so the wrapped include is skipped.
      const files = {
        'main.adoc': ':flag:\n:flag!:\n\nifdef::flag[]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== Should Skip\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      expect(content).not.toContain('== Should Skip');
    });

    test('seedAttributes gate includes guarded by attributes Asciidoctor injects (e.g. backend-html5)', () => {
      // An `ifdef::backend-html5[]include::…]` region is ACTIVE under Asciidoctor's html5 render
      // because `backend-html5` is an intrinsic attribute it always sets. The assembler never sees a
      // `:backend-html5:` line, so without the seed it would wrongly gate the include OFF and drop the
      // chapter from the preview. The seed makes the assembler agree with Asciidoctor (FR-029/Finding#1).
      const files = {
        'main.adoc': 'ifdef::backend-html5[]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== HTML Only Chapter\n',
      };
      const seeded = assembleIncludes('main.adoc', reader(files), {
        seedAttributes: new Map([['backend-html5', '']]),
      });
      expect(seeded.content).toContain('== HTML Only Chapter');

      // And the inverse holds: a seeded attribute makes an `ifndef` of it inactive.
      const ndefFiles = {
        'main.adoc': 'ifndef::backend-html5[]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== Non-HTML Chapter\n',
      };
      const ndef = assembleIncludes('main.adoc', reader(ndefFiles), {
        seedAttributes: new Map([['backend-html5', '']]),
      });
      expect(ndef.content).not.toContain('== Non-HTML Chapter');
    });

    test('seedAttributes seed path-attribute substitution for include targets', () => {
      // A seeded attribute (e.g. an inherited `{partsdir}`) must be in scope for `include::{partsdir}/…`
      // target substitution, just like a `:partsdir:` defined in the source would be.
      const files = {
        'main.adoc': 'include::{partsdir}/ch.adoc[]\n',
        'parts/ch.adoc': '== Seeded Path Chapter\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files), {
        seedAttributes: new Map([['partsdir', 'parts']]),
      });
      expect(content).toContain('== Seeded Path Chapter');
    });

    test('a source-defined attribute overrides a seeded one (document order still wins)', () => {
      // Seeds are the starting state; an explicit `:flag!:` in the source unsets it, so the guarded
      // include is skipped — the seed must not be immune to in-document changes.
      const files = {
        'main.adoc': ':flag!:\n\nifdef::flag[]\ninclude::ch.adoc[]\nendif::[]\n',
        'ch.adoc': '== Should Skip\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files), {
        seedAttributes: new Map([['flag', '']]),
      });
      expect(content).not.toContain('== Should Skip');
    });
  });

  // ── T061 (US9/FR-033..FR-036): partial includes by `tags=` / `lines=` ───────────────────────
  // A partial include selects only the matching slice of the child BEFORE it is inlined; the slice
  // then participates in attribute resolution and leveloffset exactly like a whole include. Tag
  // marker lines (`// tag::x[]` / `// end::x[]`) are excluded from output, and a non-matching or
  // out-of-range selection renders gracefully (empty slice) without breaking the surrounding doc.
  describe('partial includes by tags= / lines= (US9)', () => {
    describe('tag filtering', () => {
      const tagged = [
        'Before all tags.',
        '// tag::intro[]',
        'Intro line one.',
        'Intro line two.',
        '// end::intro[]',
        'Between regions.',
        '// tag::detail[]',
        'Detail line.',
        '// end::detail[]',
        'After all tags.',
        '',
      ].join('\n');

      test('tags=intro selects only that region, excluding the marker lines', () => {
        const files = { 'main.adoc': 'include::child.adoc[tags=intro]\n', 'child.adoc': tagged };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Intro line one.');
        expect(content).toContain('Intro line two.');
        // Other regions / untagged content are excluded.
        expect(content).not.toContain('Detail line.');
        expect(content).not.toContain('Before all tags.');
        expect(content).not.toContain('Between regions.');
        expect(content).not.toContain('After all tags.');
        // The tag marker lines themselves are never emitted.
        expect(content).not.toContain('tag::intro');
        expect(content).not.toContain('end::intro');
      });

      test('tags=intro;detail selects multiple named regions', () => {
        const files = { 'main.adoc': 'include::child.adoc[tags=intro;detail]\n', 'child.adoc': tagged };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Intro line one.');
        expect(content).toContain('Detail line.');
        expect(content).not.toContain('Between regions.');
        expect(content).not.toContain('Before all tags.');
      });

      test('tags=*;!detail selects all regions except the negated one', () => {
        const files = { 'main.adoc': 'include::child.adoc[tags=*;!detail]\n', 'child.adoc': tagged };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Intro line one.');
        expect(content).not.toContain('Detail line.');
        // Untagged content stays excluded (only tagged regions are selected by `*`).
        expect(content).not.toContain('Before all tags.');
      });

      test('tags=** selects ALL lines including untagged (every line except markers)', () => {
        // Asciidoctor: `**` selects all lines except the tag-directive lines themselves — including
        // content that sits OUTSIDE any tagged region. This is the documented difference from `*`,
        // which selects only tagged regions (#5).
        const nested = [
          'Untagged top.',
          '// tag::outer[]',
          'Outer line.',
          '// tag::inner[]',
          'Inner line.',
          '// end::inner[]',
          'Outer tail.',
          '// end::outer[]',
          'Untagged tail.',
          '',
        ].join('\n');
        const files = { 'main.adoc': 'include::child.adoc[tags=**]\n', 'child.adoc': nested };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Outer line.');
        expect(content).toContain('Inner line.');
        expect(content).toContain('Outer tail.');
        expect(content).toContain('Untagged top.'); // `**` keeps untagged content (unlike `*`)
        expect(content).toContain('Untagged tail.');
        expect(content).not.toContain('tag::');
      });

      test('tags=!* selects ONLY untagged content (implies **;!*)', () => {
        const files = { 'main.adoc': 'include::child.adoc[tags=!*]\n', 'child.adoc': tagged };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Before all tags.');
        expect(content).toContain('Between regions.');
        expect(content).toContain('After all tags.');
        // Tagged-region content is excluded.
        expect(content).not.toContain('Intro line one.');
        expect(content).not.toContain('Detail line.');
        expect(content).not.toContain('tag::');
      });

      test('tags=!detail (only exclusions) keeps everything except the negated region, incl. untagged', () => {
        const files = { 'main.adoc': 'include::child.adoc[tags=!detail]\n', 'child.adoc': tagged };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Before all tags.'); // untagged kept when only exclusions are given
        expect(content).toContain('Intro line one.');
        expect(content).toContain('After all tags.');
        expect(content).not.toContain('Detail line.'); // the excluded region is dropped
      });

      test('a non-matching tag (tags=nope) yields an empty slice without breaking the surrounding doc', () => {
        const files = {
          'main.adoc': '= Book\n\ninclude::child.adoc[tags=nope]\n\n== After\n',
          'child.adoc': tagged,
        };
        const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
        expect(content).not.toContain('Intro line one.');
        expect(content).not.toContain('Detail line.');
        // The surrounding document still renders.
        expect(content).toContain('= Book');
        expect(content).toContain('== After');
        expect(unresolved).toEqual([]);
      });

      test('a nested include inside a selected tag region still expands', () => {
        const files = {
          'main.adoc': 'include::child.adoc[tags=intro]\n',
          'child.adoc': '// tag::intro[]\nIntro.\ninclude::grand.adoc[]\n// end::intro[]\nOutside.\n',
          'grand.adoc': 'Grandchild body.\n',
        };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('Intro.');
        expect(content).toContain('Grandchild body.');
        expect(content).not.toContain('Outside.');
        expect(content).not.toContain('include::');
      });
    });

    describe('line ranges', () => {
      const numbered = ['line one', 'line two', 'line three', 'line four', 'line five', ''].join('\n');

      test('lines=2..4 selects the closed range', () => {
        const files = { 'main.adoc': 'include::child.adoc[lines=2..4]\n', 'child.adoc': numbered };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('line two');
        expect(content).toContain('line three');
        expect(content).toContain('line four');
        expect(content).not.toContain('line one');
        expect(content).not.toContain('line five');
      });

      test('lines=3 selects a single line', () => {
        const files = { 'main.adoc': 'include::child.adoc[lines=3]\n', 'child.adoc': numbered };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('line three');
        expect(content).not.toContain('line two');
        expect(content).not.toContain('line four');
      });

      test('lines=1;3..4 selects multiple ranges', () => {
        const files = { 'main.adoc': 'include::child.adoc[lines=1;3..4]\n', 'child.adoc': numbered };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('line one');
        expect(content).toContain('line three');
        expect(content).toContain('line four');
        expect(content).not.toContain('line two');
        expect(content).not.toContain('line five');
      });

      test('lines=4.. is open-ended to end of file', () => {
        const files = { 'main.adoc': 'include::child.adoc[lines=4..]\n', 'child.adoc': numbered };
        const { content } = assembleIncludes('main.adoc', reader(files));
        expect(content).toContain('line four');
        expect(content).toContain('line five');
        expect(content).not.toContain('line three');
      });

      test('an out-of-range line selection (lines=999..1000) yields an empty slice, doc intact', () => {
        const files = {
          'main.adoc': '= Book\n\ninclude::child.adoc[lines=999..1000]\n\n== After\n',
          'child.adoc': numbered,
        };
        const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
        expect(content).not.toContain('line one');
        expect(content).toContain('= Book');
        expect(content).toContain('== After');
        expect(unresolved).toEqual([]);
      });
    });

    test('a sliced partial include still wraps in absolute :leveloffset: set/restore', () => {
      const files = {
        'main.adoc': 'include::child.adoc[lines=1;leveloffset=+1]\n',
        'child.adoc': '== Section\n\nBody.\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('== Section');
      expect(content).not.toContain('Body.');
      expect(content).toContain(':leveloffset: 1');
      expect(content).toContain(':leveloffset: 0');
    });

    test('a partial slice resolves attributes defined before the include in its line content', () => {
      const files = {
        'main.adoc': ':partsdir: parts\n\ninclude::child.adoc[lines=1]\n',
        'child.adoc': 'include::{partsdir}/x.adoc[]\n',
        'parts/x.adoc': '= X\n',
      };
      const { content, unresolved } = assembleIncludes('main.adoc', reader(files));
      expect(content).toContain('= X');
      expect(unresolved).toEqual([]);
    });

    test('a whole include (no tags=/lines=) is unaffected by the slicing path', () => {
      const files = {
        'main.adoc': 'include::child.adoc[]\n',
        'child.adoc': '// tag::x[]\nTagged.\n// end::x[]\nUntagged.\n',
      };
      const { content } = assembleIncludes('main.adoc', reader(files));
      // With no selector, the entire child (including its tag marker lines) is inlined verbatim.
      expect(content).toContain('Tagged.');
      expect(content).toContain('Untagged.');
      expect(content).toContain('tag::x');
    });
  });
});

// T002: source map tests (feature 032)
describe('assembleIncludes — source map (withSourceMap, feature 032)', () => {
  test('regression: without withSourceMap, content and unresolved are byte-for-byte identical to existing behaviour', () => {
    const files = {
      'main.adoc': '= Book\n\ninclude::ch.adoc[]\n',
      'ch.adoc': '== Chapter\n\nBody.\n',
    };
    const withoutFlag = assembleIncludes('main.adoc', reader(files));
    const withFalseFlag = assembleIncludes('main.adoc', reader(files), { withSourceMap: false });
    expect(withoutFlag.content).toBe(withFalseFlag.content);
    expect(withoutFlag.unresolved).toEqual(withFalseFlag.unresolved);
    expect(withoutFlag.sourceMap).toBeUndefined();
    expect(withFalseFlag.sourceMap).toBeUndefined();
  });

  test('regression: withSourceMap:true does not change content or unresolved', () => {
    const files = {
      'main.adoc': '= Book\n\ninclude::ch.adoc[]\n',
      'ch.adoc': '== Chapter\n\nBody.\n',
    };
    const withoutFlag = assembleIncludes('main.adoc', reader(files));
    const withFlag = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(withFlag.content).toBe(withoutFlag.content);
    expect(withFlag.unresolved).toEqual(withoutFlag.unresolved);
  });

  test('sourceMap.lineToSource.length === assembled line count (single file)', () => {
    const files = { 'main.adoc': 'Line1\nLine2\nLine3\n' };
    const { content, sourceMap } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    const lines = content.split('\n');
    expect(sourceMap).toBeDefined();
    expect(sourceMap!.lineToSource.length).toBe(lines.length);
  });

  test('sourceMap entries point to the root file for a single-file document', () => {
    const files = { 'main.adoc': 'Line1\nLine2\n' };
    const { sourceMap } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(sourceMap).toBeDefined();
    for (const entry of sourceMap!.lineToSource) {
      expect(entry.path).toBe('main.adoc');
    }
  });

  test('lineToSource[i] has sourceLine=i+1 for a single-file document (1-based)', () => {
    const files = { 'main.adoc': 'Line1\nLine2\nLine3\n' };
    const { sourceMap } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(sourceMap!.lineToSource[0].sourceLine).toBe(1);
    expect(sourceMap!.lineToSource[1].sourceLine).toBe(2);
    expect(sourceMap!.lineToSource[2].sourceLine).toBe(3);
  });

  test('included file lines resolve to the child path and correct source lines', () => {
    const files = {
      'main.adoc': '= Title\ninclude::ch.adoc[]\nEpilogue\n',
      'ch.adoc': 'Ch-L1\nCh-L2\n',
    };
    const { sourceMap } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(sourceMap).toBeDefined();
    const map = sourceMap!.lineToSource;
    // Line 1 of assembled = "= Title" — root file, line 1
    expect(map[0]).toMatchObject({ path: 'main.adoc', sourceLine: 1 });
    // After the include directive, next lines come from ch.adoc
    const chStart = map.findIndex((entry) => entry.path === 'ch.adoc');
    expect(chStart).toBeGreaterThan(-1);
    expect(map[chStart]).toMatchObject({ path: 'ch.adoc', sourceLine: 1 });
    expect(map[chStart + 1]).toMatchObject({ path: 'ch.adoc', sourceLine: 2 });
    // "Epilogue" comes back in main.adoc
    const epilogueIndex = map.findLastIndex((entry) => entry.path === 'main.adoc');
    expect(epilogueIndex).toBeGreaterThan(chStart + 1);
  });

  test('nested includes: lineToSource entries resolve to each file at the correct source lines', () => {
    const files = {
      'main.adoc': 'A\ninclude::b.adoc[]\nZ\n',
      'b.adoc': 'B1\ninclude::c.adoc[]\nB3\n',
      'c.adoc': 'C1\nC2',   // no trailing newline → exactly 2 lines
    };
    const { sourceMap } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    const map = sourceMap!.lineToSource;
    const cEntries = map.filter((entry) => entry.path === 'c.adoc');
    expect(cEntries).toHaveLength(2);
    expect(cEntries[0].sourceLine).toBe(1);
    expect(cEntries[1].sourceLine).toBe(2);
  });

  test('unresolved includes still produce a placeholder line whose source points to the containing file', () => {
    const files = { 'main.adoc': 'Before\ninclude::missing.adoc[]\nAfter\n' };
    const { sourceMap, unresolved } = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(unresolved).toHaveLength(1);
    expect(sourceMap).toBeDefined();
    // The placeholder line should still map to main.adoc
    const placeholderIndex = sourceMap!.lineToSource.findIndex((entry) => entry.path === 'main.adoc' && entry.sourceLine === 2);
    expect(placeholderIndex).toBeGreaterThan(-1);
  });

  // T036 — Principle VIII: regression guard proving that the assembled content piped to the preview
  // renderer (sanitization + scroll-sync) is byte-for-byte identical whether or not source mapping is
  // requested. Covers leveloffset and tags to exercise the same paths the preview worker uses.
  test('preview-relevant content (leveloffset + tags) is byte-for-byte unchanged with withSourceMap:true', () => {
    const files = {
      'main.adoc': '= Book\n\ninclude::ch.adoc[leveloffset=+1,tags=body]\n',
      'ch.adoc': '// tag::body[]\n== Chapter\n\nParagraph.\n// end::body[]\n',
    };
    const baseline = assembleIncludes('main.adoc', reader(files));
    const withMap = assembleIncludes('main.adoc', reader(files), { withSourceMap: true });
    expect(withMap.content).toBe(baseline.content);
    expect(withMap.unresolved).toEqual(baseline.unresolved);
  });
});
