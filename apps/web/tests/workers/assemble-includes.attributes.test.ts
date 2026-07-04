import { assembleIncludes } from '@/workers/assemble-includes';

function reader(files: Record<string, string>) {
  return (path: string) => files[path] ?? null;
}

// ── assembler attribute fidelity in hide mode ──────────────────────────────
//
// With `showIncludes:false` the assembler suppresses included body content, but it MUST still
// emit attribute-set/unset lines so that later content (and Asciidoctor itself) sees the correct
// attribute state — identical to full-inline mode in that regard. These tests verify five
// distinct cases of that contract; they are expected to FAIL until hide mode is implemented (the
// assembler currently ignores `showIncludes` and inlines everything).
describe('assembleIncludes — attribute fidelity in hide mode', () => {
  // 1. :leveloffset: from nested include still applies in hide mode
  //    root → child.adoc → grandchild.adoc (sets :leveloffset: 2)
  //    The attribute entry must appear in the assembled output even though the grandchild body is
  //    hidden, so that later headings in the root document render at the correct level.
  test(':leveloffset: from nested include still applies with showIncludes:false', () => {
    const files = {
      'root.adoc': 'include::child.adoc[]\n\n== Root Section\n',
      'child.adoc': 'Child intro.\ninclude::grandchild.adoc[]\n',
      'grandchild.adoc': ':leveloffset: 2\n\nGrandchild body.\n',
    };
    const { content } = assembleIncludes('root.adoc', reader(files), { showIncludes: false });
    // The attribute entry must be emitted so Asciidoctor sees it.
    expect(content).toContain(':leveloffset: 2');
    // But the grandchild body prose should NOT be in the output (it is hidden).
    expect(content).not.toContain('Grandchild body.');
    // The child body should also NOT be in the output (it is hidden).
    expect(content).not.toContain('Child intro.');
  });

  // 2. :table-caption: from nested include still applies in hide mode
  //    root → child.adoc → grandchild.adoc (sets :table-caption: Tableau)
  //    The entry must be emitted even though the grandchild body is hidden.
  test(':table-caption: from nested include still applies with showIncludes:false', () => {
    const files = {
      'root.adoc': 'include::child.adoc[]\n\n|===\n| Cell\n|===\n',
      'child.adoc': 'Child prose.\ninclude::grandchild.adoc[]\n',
      'grandchild.adoc': ':table-caption: Tableau\n\nGrandchild content.\n',
    };
    const { content } = assembleIncludes('root.adoc', reader(files), { showIncludes: false });
    // The attribute entry must survive even though the file body is suppressed.
    expect(content).toContain(':table-caption: Tableau');
    // Suppressed prose must not leak.
    expect(content).not.toContain('Grandchild content.');
    expect(content).not.toContain('Child prose.');
  });

  // 3. A conditionally-gated (ifdef false) include contributes no attributes
  //    The flag is not set, so the ifdef branch is inactive; the include is never expanded,
  //    and no attribute from the child appears in the output — in EITHER mode.
  test('a conditionally-gated (ifdef false) include contributes no attributes', () => {
    const files = {
      'root.adoc': 'ifdef::missing-flag[]\ninclude::child.adoc[]\nendif::[]\n\nVisible body.\n',
      'child.adoc': ':from-child: yes\n\nChild body.\n',
    };
    // In show mode: the include is gated off by the inactive ifdef, so no attributes appear.
    const showResult = assembleIncludes('root.adoc', reader(files), { showIncludes: true });
    expect(showResult.content).not.toContain(':from-child:');
    expect(showResult.content).not.toContain('Child body.');

    // In hide mode: same — the include is inactive, so no attributes from it appear either.
    const hideResult = assembleIncludes('root.adoc', reader(files), { showIncludes: false });
    expect(hideResult.content).not.toContain(':from-child:');
    expect(hideResult.content).not.toContain('Child body.');
  });

  // 4. A downstream ifdef::flag[] whose :flag: is set by a hidden include still evaluates correctly
  //    The assembler leaves conditional directive lines verbatim for Asciidoctor; it does NOT expand
  //    them itself. What MUST happen: the `:enabled:` attribute entry from setter.adoc is emitted
  //    into the assembled source BEFORE the `ifdef::enabled[...]` line, so Asciidoctor sees the
  //    attribute when it evaluates the conditional natively.
  test(':flag: set by a hidden include appears before a downstream ifdef::flag[] line', () => {
    const files = {
      'root.adoc': 'include::setter.adoc[]\nifdef::enabled[Body visible when enabled is set]\n',
      'setter.adoc': ':enabled:\n\nSetter prose.\n',
    };
    const { content } = assembleIncludes('root.adoc', reader(files), { showIncludes: false });
    // The :enabled: attribute entry must be emitted.
    expect(content).toContain(':enabled:');
    // The assembler leaves the ifdef line verbatim for Asciidoctor (not expanded by the assembler).
    expect(content).toContain('ifdef::enabled[Body visible when enabled is set]');
    // CRITICAL: :enabled: must appear BEFORE the ifdef line, so Asciidoctor sees the attribute.
    const enabledIndex = content.indexOf(':enabled:');
    const ifdefIndex = content.indexOf('ifdef::enabled[Body visible when enabled is set]');
    expect(enabledIndex).toBeGreaterThan(-1);
    expect(ifdefIndex).toBeGreaterThan(-1);
    expect(enabledIndex).toBeLessThan(ifdefIndex);
    // Setter prose is hidden.
    expect(content).not.toContain('Setter prose.');
  });

  // 5. A partial include (tags=exported) contributes only attributes from the selected portion
  //    child.adoc has two attribute entries: :exported-attr: yes inside the `exported` tag region,
  //    and :private-attr: no outside it. In hide mode with tags=exported, only the exported portion
  //    is selected; therefore only :exported-attr: yes must appear in the output.
  test('partial include (tags=exported) contributes only attributes from the selected portion', () => {
    const files = {
      'root.adoc': 'include::child.adoc[tags=exported]\n\nRoot body.\n',
      'child.adoc': [
        '// tag::exported[]',
        ':exported-attr: yes',
        '// end::exported[]',
        ':private-attr: no',
        '',
      ].join('\n'),
    };
    const { content } = assembleIncludes('root.adoc', reader(files), { showIncludes: false });
    // Only the attribute from the selected portion should appear.
    expect(content).toContain(':exported-attr: yes');
    // The attribute outside the selected tag region must NOT appear.
    expect(content).not.toContain(':private-attr: no');
  });
});
