import {
  MAX_HEADING_LEVEL,
  parseLevelOffset,
  computeHeadingLevels,
  isBoundaryBlockConstruct,
  type IncludeResolutionContext,
} from '@/lib/codemirror/asciidoc-effective-levels';

describe('parseLevelOffset', () => {
  test('relative +N / -N', () => {
    expect(parseLevelOffset(':leveloffset: +1')).toEqual({ kind: 'relative', delta: 1 });
    expect(parseLevelOffset(':leveloffset: -2')).toEqual({ kind: 'relative', delta: -2 });
  });
  test('absolute N', () => {
    expect(parseLevelOffset(':leveloffset: 2')).toEqual({ kind: 'set', value: 2 });
  });
  test('unset via suffix `!`, prefix `!`, or empty value', () => {
    expect(parseLevelOffset(':leveloffset!:')).toEqual({ kind: 'unset' });
    expect(parseLevelOffset(':!leveloffset:')).toEqual({ kind: 'unset' }); // Asciidoctor prefix-unset form
    expect(parseLevelOffset(':leveloffset:')).toEqual({ kind: 'unset' });
  });
  test('non-leveloffset line → null', () => {
    expect(parseLevelOffset(':author: x')).toBeNull();
    expect(parseLevelOffset('== Heading')).toBeNull();
  });
});

describe('computeHeadingLevels', () => {
  test('raw levels from marker count (== → 1, === → 2)', () => {
    const infos = computeHeadingLevels('= Title\n\n== One\n\n=== Two\n');
    expect(infos.map((index) => index.effectiveLevel)).toEqual([0, 1, 2]);
    expect(infos.map((index) => index.rawLevel)).toEqual([0, 1, 2]);
  });

  test('in-file :leveloffset: +1 shifts subsequent headings (document order)', () => {
    const source = '== Before\n\n:leveloffset: +1\n\n== After\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(1); // before the offset
    expect(infos[1].effectiveLevel).toBe(2); // shifted by +1
  });

  test(':leveloffset!: unsets back to the inherited base', () => {
    const source = ':leveloffset: +2\n\n== A\n\n:leveloffset!:\n\n== B\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(3); // 1 + 2
    expect(infos[1].effectiveLevel).toBe(1); // reset
  });

  test('absolute :leveloffset: 0 then relative', () => {
    const source = ':leveloffset: 1\n\n== A\n\n:leveloffset: +1\n\n== B\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(2); // 1 + 1
    expect(infos[1].effectiveLevel).toBe(3); // 1 + 1 + 1
  });

  test('inherited offset is added to every heading', () => {
    const infos = computeHeadingLevels('== A\n', 2);
    expect(infos[0].effectiveLevel).toBe(3);
  });

  // ── Attribute-form :leveloffset: combined with the inherited include offset ──
  // The file's structural understanding must reflect BOTH the offset inherited from ancestor
  // includes (leveloffset= option / parent attribute form) AND an attribute-form `:leveloffset:`
  // applied in document order within the file, exactly as the assembled preview renders it.

  test('attribute-form :leveloffset: +1 composes with a non-zero inherited offset', () => {
    // Inherited +1 (the file was included with leveloffset=+1); a `== After` raw level 1 is
    // effective 2 before the attribute-form entry, and a further relative `:leveloffset: +1`
    // makes the next heading effective 3.
    const source = '== Before\n\n:leveloffset: +1\n\n== After\n';
    const infos = computeHeadingLevels(source, 1);
    expect(infos[0].effectiveLevel).toBe(2); // 1 (raw) + 1 (inherited)
    expect(infos[1].effectiveLevel).toBe(3); // 1 (raw) + 1 (inherited) + 1 (attribute form)
  });

  test('attribute-form :leveloffset!: resets to the inherited base, not to zero', () => {
    const source = ':leveloffset: +2\n\n== A\n\n:leveloffset!:\n\n== B\n';
    const infos = computeHeadingLevels(source, 1);
    expect(infos[0].effectiveLevel).toBe(4); // 1 (raw) + 1 (inherited) + 2 (attribute form)
    expect(infos[1].effectiveLevel).toBe(2); // 1 (raw) + 1 (inherited) — reset to the inherited base
  });

  test('an absolute attribute-form :leveloffset: N ignores the inherited base until unset', () => {
    // An absolute set replaces the running offset entirely (it does not add to the inherited base);
    // unsetting then returns to the inherited base.
    const source = ':leveloffset: 2\n\n== A\n\n:leveloffset!:\n\n== B\n';
    const infos = computeHeadingLevels(source, 1);
    expect(infos[0].effectiveLevel).toBe(3); // 1 (raw) + 2 (absolute set)
    expect(infos[1].effectiveLevel).toBe(2); // 1 (raw) + 1 (inherited base)
  });

  test('effective level beyond MAX is flagged', () => {
    const source = ':leveloffset: +5\n\n====== Deep\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBeGreaterThan(MAX_HEADING_LEVEL);
    expect(infos[0].beyondMax).toBe(true);
  });

  test('[discrete] / [float] headings are recognised', () => {
    const source = '[discrete]\n== Discrete One\n\n[float]\n=== Float Two\n\n== Normal\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].discrete).toBe(true);
    expect(infos[1].discrete).toBe(true);
    expect(infos[2].discrete).toBe(false);
  });

  test('headings inside a verbatim block are not counted', () => {
    const source = '== Real\n\n----\n== Not a heading\n----\n\n== Also Real\n';
    const infos = computeHeadingLevels(source);
    expect(infos.map((index) => index.line)).toEqual([1, 7]);
  });

  test('from offsets point at the line start', () => {
    const source = 'intro\n\n== Section\n';
    const infos = computeHeadingLevels(source);
    expect(source.slice(infos[0].from, infos[0].from + 2)).toBe('==');
  });

  // ── Block-boundary rule (paragraph absorption) ───────────────────────────────
  // A `==`-line glued to preceding prose (no blank line) is paragraph text, not a heading,
  // so it must never be folded or font-styled as one. Mirrors Asciidoctor + the Lezer grammar.

  test('a heading glued under prose is absorbed into the paragraph (not a heading)', () => {
    const infos = computeHeadingLevels('Some prose text\n== Section Foo\n');
    expect(infos).toHaveLength(0);
  });

  test('a heading after a closed delimited block (no blank line) is a heading', () => {
    // Asciidoctor renders `<h2>` here — a closing delimiter is a block boundary.
    const infos = computeHeadingLevels('****\nSidebar block\n****\n== Section Foo\n');
    expect(infos.map((info) => info.line)).toEqual([4]);
  });

  test('a blank line ends the paragraph so the next heading is recognised', () => {
    const infos = computeHeadingLevels('Some prose text\n\n== Section Foo\n');
    expect(infos.map((info) => info.line)).toEqual([3]);
  });

  test('headings glued under single-line block constructs are still headings', () => {
    for (const opener of ['[#myid]', '[.lead]', '.Block title', '// a comment', ':attr: val', 'image::pic.png[]']) {
      const infos = computeHeadingLevels(`${opener}\n== Heading\n`);
      expect(infos.map((info) => info.line)).toEqual([2]);
    }
  });

  test('a heading is suppressed after a list item with no blank line', () => {
    const infos = computeHeadingLevels('* item\n== Heading\n');
    expect(infos).toHaveLength(0);
  });

  test('only the first of a prose-glued heading run is absorbed; later sections still parse', () => {
    const infos = computeHeadingLevels('intro\n== Glued\n\n== Real\n');
    expect(infos.map((info) => info.line)).toEqual([4]);
  });
});

describe('isBoundaryBlockConstruct', () => {
  test('recognises attribute entries, block-attr/anchor lines, block titles, comments, block macros', () => {
    for (const line of [':attr: v', ':attr!:', '[.lead]', '[#id]', '[[id]]', '.Title', '// note', 'image::x.png[]']) {
      expect(isBoundaryBlockConstruct(line)).toBe(true);
    }
  });

  test('plain prose and list markers are not block constructs', () => {
    for (const line of ['Some prose', '* item', '- item', 'word word', '. ordered']) {
      expect(isBoundaryBlockConstruct(line)).toBe(false);
    }
  });
});

function makeIncludeContext(files: Record<string, string>, fromFileId: string): IncludeResolutionContext {
  return {
    fileId: fromFileId,
    getContent: (id) => files[id] ?? null,
    resolveInclude: (fromId, target) => {
      const directory = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/') + 1) : '';
      const resolved = directory + target;
      return files[resolved] === undefined ? null : resolved;
    },
  };
}

describe('computeHeadingLevels with includeContext', () => {
  test('an include inside an inactive ifdef block does NOT contribute its leveloffset', () => {
    // flag is not defined anywhere → ifdef::flag[] region is inactive.
    // Without the fix, traceFinalOffset blindly follows the include and picks up :leveloffset: +1.
    const files = {
      'main.adoc': 'ifdef::flag[]\ninclude::child.adoc[]\nendif::[]\n== After\n',
      'child.adoc': ':leveloffset: +1\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // == After should be at effective level 1 (include inside inactive ifdef was skipped)
    expect(headings[0]?.effectiveLevel).toBe(1);
  });

  test('a file included via two sibling paths (diamond) contributes its leveloffset per occurrence', () => {
    // main → a → shared; main → b → shared. shared sets :leveloffset: +1 (attribute form, persists).
    // Ground truth (real Asciidoctor): includes are EXPANDED per occurrence, so the +1 is applied once
    // per path → == After renders at effective level 3 (<h4>). The editor walk mirrors that
    // per-occurrence expansion (path-stack cycle guard, not a permanent visited set), so it agrees with
    // the preview instead of deduping the diamond down to a single +1.
    const files = {
      'main.adoc': 'include::a.adoc[]\ninclude::b.adoc[]\n== After\n',
      'a.adoc': 'include::shared.adoc[]\n',
      'b.adoc': 'include::shared.adoc[]\n',
      'shared.adoc': ':leveloffset: +1\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // == After at effective level 3: offset +2 (shared expanded once per path).
    expect(headings[0]?.effectiveLevel).toBe(3);
    expect(headings[0]?.beyondMax).toBe(false);
  });

  test('a file included twice as direct siblings accumulates its persisting leveloffset each time', () => {
    // main includes shared TWICE; shared sets :leveloffset: +1 (persists). Ground truth (real
    // Asciidoctor): A after the first include is <h3> (offset +1); B after the second is <h4> (offset
    // +2). Each occurrence is expanded, so the offset accumulates rather than being counted once.
    const files = {
      'main.adoc': 'include::shared.adoc[]\n\n== A\n\ninclude::shared.adoc[]\n\n== B\n',
      'shared.adoc': ':leveloffset: +1\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    expect(headings.find((h) => h.line === 3)?.effectiveLevel).toBe(2); // == A → offset +1
    expect(headings.find((h) => h.line === 7)?.effectiveLevel).toBe(3); // == B → offset +2
  });

  test('attribute-form :leveloffset: from an included file shifts headings in the parent', () => {
    const files = {
      'main.adoc': 'include::child.adoc[]\n== After Include\n',
      'child.adoc': ':leveloffset: +1\n== In Child\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // == After Include: raw level 1, child set :leveloffset: +1 (attribute form), so effective = 1 + 1 = 2
    const afterHeading = headings.find((heading) => !heading.beyondMax);
    expect(afterHeading?.effectiveLevel).toBe(2);
  });

  test('leveloffset= option form does NOT shift headings in the parent (scoped)', () => {
    const files = {
      'main.adoc': 'include::child.adoc[leveloffset=+1]\n== After Include\n',
      'child.adoc': '== In Child\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // Option form is scoped: == After Include stays at effective level 1
    const afterHeading = headings[0];
    expect(afterHeading?.effectiveLevel).toBe(1);
  });

  test('without includeContext, include lines are ignored (backward compat)', () => {
    const document = 'include::child.adoc[]\n== After Include\n';
    const headings = computeHeadingLevels(document, 0);
    expect(headings[0]?.effectiveLevel).toBe(1);
  });
});

// R2 — the editor must gate conditional includes against the SAME attribute state the preview
// (effectiveLevelOffset + the assembler) uses, so their effective heading levels never diverge. The
// gating seed carries the render intrinsics + the open file's inherited attributes; an include gated
// by an attribute that lives ONLY in that seed (not written in the open file) must still be walked.
// This pins the previous `EMPTY_ATTRS` divergence, where the editor evaluated gating against a
// constant empty map and so silently dropped the offset from an intrinsic/inherited-guarded include.
describe('computeHeadingLevels gates includes against the real attribute seed (R2 parity)', () => {
  const files = {
    'main.adoc': 'ifdef::flavor[]\ninclude::shifter.adoc[]\nendif::[]\n== After\n',
    'shifter.adoc': ':leveloffset: +2\n',
  };
  const contextWithSeed = (seed?: ReadonlyMap<string, string>): IncludeResolutionContext => ({
    ...makeIncludeContext(files, 'main.adoc'),
    seedAttributes: seed,
  });

  test('an include guarded by a SEEDED attribute contributes its persisted leveloffset', () => {
    const headings = computeHeadingLevels(files['main.adoc'], 0, contextWithSeed(new Map([['flavor', '']])));
    // ifdef::flavor[] active (flavor in seed) → shifter's :leveloffset: +2 persists → == After = 1 + 2.
    expect(headings.find((h) => !h.beyondMax)?.effectiveLevel ?? headings[0]?.effectiveLevel).toBe(3);
  });

  test('the same include with the attribute UNSET does not shift (gated off)', () => {
    const headings = computeHeadingLevels(files['main.adoc'], 0, contextWithSeed());
    // flavor undefined → ifdef inactive → include skipped → == After stays at level 1.
    expect(headings[0]?.effectiveLevel).toBe(1);
  });
});

// Editor open-file walk must match the verbatim-aware preview (documentOrderEvents) walk.
describe('computeHeadingLevels open-file walk matches the preview', () => {
  // #2 — an attribute/conditional directive INSIDE a verbatim (listing) block is literal sample text;
  // it must not enter the gating state. Ground truth (real Asciidoctor S6): After stays h2 (level 1).
  test('an attribute set inside a listing block does NOT gate a later include', () => {
    const files = {
      'main.adoc': '----\n:flavor: x\n----\n\nifdef::flavor[]\ninclude::shifter.adoc[]\nendif::[]\n\n== After\n',
      'shifter.adoc': ':leveloffset: +2\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // flavor is inside the code block → ifdef inactive → shifter skipped → == After at level 1.
    expect(headings.find((h) => !h.beyondMax)?.effectiveLevel ?? headings[0]?.effectiveLevel).toBe(1);
  });

  test('a conditional directive inside a listing block does not open a gating region', () => {
    // An unbalanced `ifdef::x[]` written inside a code sample must NOT gate the real include below it.
    const files = {
      'main.adoc': '----\nifdef::env-github[]\n----\n\ninclude::shifter.adoc[]\n\n== After\n',
      'shifter.adoc': ':leveloffset: +2\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    // The in-listing ifdef is literal text; the real include is active → :leveloffset:+2 persists → 3.
    expect(headings.find((h) => !h.beyondMax)?.effectiveLevel ?? headings[0]?.effectiveLevel).toBe(3);
  });

  // #3 — an attribute DEFINED in a `leveloffset=` option include persists and can gate a later include
  // (the option scopes only the OFFSET, not other attributes). Ground truth (real Asciidoctor S5):
  // After = h5 → effective level 4 (offset 3 from the ifdef-gated shifter).
  test('an attribute from a leveloffset= option include gates a later include (offset persists)', () => {
    const files = {
      'main.adoc': 'include::setup.adoc[leveloffset=+1]\n\nifdef::feature[]\ninclude::shifter.adoc[]\nendif::[]\n\n== After\n',
      'setup.adoc': ':feature:\n',
      'shifter.adoc': ':leveloffset: +3\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    expect(headings.find((h) => !h.beyondMax && h.line >= 6)?.effectiveLevel ?? headings.at(-1)?.effectiveLevel).toBe(4);
  });
});

// A STRUCTURAL delimited block (example `====`, open `--`, sidebar `****`, quote `____`, table `|===`)
// is NOT verbatim: the preprocessor still folds attribute entries, evaluates conditionals, and expands
// includes inside it, and an attribute-form `:leveloffset:` set inside persists AFTER the block. Only a
// VERBATIM fence (listing `----`, literal `....`, passthrough `++++`, comment `////`) makes its body
// literal. The editor walk must match the shared engine's `verbatimRanges` (which excludes only verbatim
// fences) — otherwise its heading levels diverge from the preview. All levels below are real-Asciidoctor
// ground truth.
describe('computeHeadingLevels processes directives inside structural (non-verbatim) blocks', () => {
  test('a :leveloffset: set inside an open block persists after the block', () => {
    // Ground truth: `== After` → <h4> (effective level 3). No includeContext needed — the leveloffset
    // entry is resolved directly, and the open-block body must not be treated as literal.
    const infos = computeHeadingLevels('= Doc\n\n--\n:leveloffset: +2\n--\n\n== After\n');
    const after = infos.find((info) => info.rawLevel === 1);
    expect(after?.effectiveLevel).toBe(3);
  });

  test('a :leveloffset: set inside an example block persists after the block', () => {
    const infos = computeHeadingLevels('= Doc\n\n====\n:leveloffset: +2\n====\n\n== After\n');
    expect(infos.find((info) => info.rawLevel === 1)?.effectiveLevel).toBe(3);
  });

  test('the SAME entry inside a verbatim listing block stays literal (does NOT persist)', () => {
    // Contrast: a `----` fence is verbatim, so `:leveloffset: +2` inside is sample text → == After
    // stays at effective level 1 (<h2>). Ground truth (real Asciidoctor).
    const infos = computeHeadingLevels('= Doc\n\n----\n:leveloffset: +2\n----\n\n== After\n');
    expect(infos.find((info) => info.rawLevel === 1)?.effectiveLevel).toBe(1);
  });

  test('an include inside an example block that sets a persisting :leveloffset: shifts later headings', () => {
    // Ground truth: `== After` → <h4> (effective level 3): the include is expanded inside the example
    // block and its :leveloffset: +2 persists after the block.
    const files = {
      'main.adoc': '= Doc\n\n====\ninclude::shifter.adoc[]\n====\n\n== After\n',
      'shifter.adoc': ':leveloffset: +2\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    expect(headings.find((h) => h.rawLevel === 1)?.effectiveLevel).toBe(3);
  });

  test('an attribute set inside an open block gates a later ifdef-wrapped include', () => {
    // Ground truth: `== After` → <h4> (effective level 3): `:flavor:` defined inside the open block is
    // in scope, so ifdef::flavor[] is active and shifter's :leveloffset: +2 persists.
    const files = {
      'main.adoc': '= Doc\n\n--\n:flavor: x\n--\n\nifdef::flavor[]\ninclude::shifter.adoc[]\nendif::[]\n\n== After\n',
      'shifter.adoc': ':leveloffset: +2\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    expect(headings.find((h) => h.rawLevel === 1)?.effectiveLevel).toBe(3);
  });

  test('a verbatim listing NESTED in an example block stays literal (its include is not expanded)', () => {
    // A `----` fence inside a `====` example is a code sample: the include it shows must NOT be walked,
    // even though the surrounding example block IS processed. Ground truth (real Asciidoctor): == After
    // stays at effective level 1 (<h2>) because shifter's :leveloffset: +3 never takes effect.
    const files = {
      'main.adoc': '====\nSample:\n----\ninclude::shifter.adoc[]\n----\n====\n\n== After\n',
      'shifter.adoc': ':leveloffset: +3\n',
    };
    const headings = computeHeadingLevels(files['main.adoc'], 0, makeIncludeContext(files, 'main.adoc'));
    expect(headings.find((h) => h.rawLevel === 1)?.effectiveLevel).toBe(1);
  });

  test('a heading INSIDE an open block is not recognised as a section', () => {
    // A `==` line inside a delimited block is block content, not a section — no heading is emitted for
    // it (matches Asciidoctor). Only `== After` (below the closed block) is a heading.
    const infos = computeHeadingLevels('--\n== Inside\n--\n\n== After\n');
    expect(infos.map((info) => info.line)).toEqual([5]);
  });
});
