import { assembleIncludes } from '@/workers/assemble-includes';
import {
  INCLUDE_PLACEHOLDER_CLASS,
  INCLUDE_PLACEHOLDER_TARGET_ATTR,
} from '@/lib/asciidoc/include-placeholder';

function reader(files: Record<string, string>) {
  return (path: string) => files[path] ?? null;
}

describe('assembleIncludes — hide mode (showIncludes: false)', () => {
  // ── Scenario 1: body suppressed; include-defined attribute still resolves ──────────────────────
  test('body is suppressed but attributes defined in the include resolve after it', () => {
    // The child defines `:product-name: Acme` and has prose "Acme Corp Description".
    // With showIncludes:false the prose must be hidden, but the attribute must survive
    // so that `{product-name}` in the PARENT resolves correctly.
    const files = {
      'main.adoc': '= Product\n\ninclude::child.adoc[]\n\nValue: {product-name}\n',
      'child.adoc': ':product-name: Acme\n\nAcme Corp Description\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), {
      showIncludes: false,
    });

    // The placeholder div must appear.
    expect(content).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
    expect(content).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="child.adoc"`);

    // The raw prose body of the child must NOT appear.
    expect(content).not.toContain('Acme Corp Description');

    // The attribute defined by the child must still resolve in later parent content.
    // (The assembler must still process the child's attribute lines even in hide mode.)
    expect(content).toContain('Value: Acme');

    expect(unresolved).toEqual([]);
  });

  // ── Scenario 2: exactly one placeholder per top-level include; none for nested ─────────────────
  test('exactly one placeholder per top-level include, none for nested includes', () => {
    // root.adoc includes child.adoc (top-level); child.adoc includes grandchild.adoc (nested).
    // Expected: ONE placeholder div for child.adoc; NO placeholder for grandchild.adoc;
    // grandchild content is not in the output either (it is part of the suppressed subtree).
    const files = {
      'root.adoc': '= Root\n\ninclude::child.adoc[]\n',
      'child.adoc': 'Child intro.\ninclude::grandchild.adoc[]\n',
      'grandchild.adoc': 'Grandchild body.\n',
    };
    const { content, unresolved } = assembleIncludes('root.adoc', reader(files), {
      showIncludes: false,
    });

    // Count occurrences of the placeholder class in the output.
    const placeholderMatches = content.match(new RegExp(`class="${INCLUDE_PLACEHOLDER_CLASS}"`, 'g'));
    expect(placeholderMatches).toHaveLength(1);

    // The one placeholder is for child.adoc.
    expect(content).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="child.adoc"`);

    // No placeholder for grandchild.adoc.
    expect(content).not.toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="grandchild.adoc"`);

    // Neither child prose nor grandchild prose appear.
    expect(content).not.toContain('Child intro.');
    expect(content).not.toContain('Grandchild body.');

    expect(unresolved).toEqual([]);
  });

  // ── Scenario 3: unresolvable include yields a placeholder with the raw target ─────────────────
  test('an unresolvable include yields a placeholder with the raw target and is recorded in unresolved[]', () => {
    // `missing.adoc` does not exist in the virtual FS.
    // With showIncludes:false the assembler should still emit a placeholder
    // (using the raw target) and record the file in unresolved[].
    const files = {
      'main.adoc': '= Doc\n\ninclude::missing.adoc[]\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), {
      showIncludes: false,
    });

    // A placeholder must appear with the raw target.
    expect(content).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
    expect(content).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="missing.adoc"`);

    // The target must also be recorded in unresolved[].
    expect(unresolved.some((u) => u.target === 'missing.adoc')).toBe(true);
  });

  // ── Scenario 4: non-AsciiDoc include (source snippet) is suppressed ──────────────────────────
  test('a non-AsciiDoc include (source snippet) is suppressed and replaced with a placeholder', () => {
    // Content suppression applies to all include types, not just .adoc files.
    // A Ruby snippet included as a code block must be hidden behind a placeholder.
    const files = {
      'main.adoc': '= Guide\n\n[source,ruby]\n----\ninclude::snippet.rb[]\n----\n',
      'snippet.rb': 'puts "Hello, world!"\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), {
      showIncludes: false,
    });

    // A placeholder must appear with the snippet target.
    expect(content).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
    expect(content).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="snippet.rb"`);

    // The raw Ruby body must not appear.
    expect(content).not.toContain('puts "Hello, world!"');

    expect(unresolved).toEqual([]);
  });

  // ── Scenario 5a: ifdef/endif in hidden child do not leak into parent ─────────────────────────
  test('ifdef/endif region markers from a hidden include do not appear in the assembled output', () => {
    // Bug: emit=false subtree was missing the emit guard on the conditionals.applyLine path,
    // causing child ifdef::foo[]/endif::[] lines to leak into the parent — corrupting Asciidoctor's
    // conditional-region parsing for all content that follows.
    const files = {
      'main.adoc': '= Doc\n\ninclude::child.adoc[]\n\nParent prose.\n',
      'child.adoc': ':attr: value\n\nifdef::flag[]\nConditional prose.\nendif::[]\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files), { showIncludes: false });

    expect(content).not.toContain('ifdef::');
    expect(content).not.toContain('endif::');
    expect(content).not.toContain('Conditional prose.');
    expect(content).toContain('Parent prose.');
    expect(content).toContain(':attr: value');
  });

  // ── Scenario 5b: include inside inactive conditional in hidden child does not leak ──────────────
  test('an include:: inside an inactive conditional in a hidden child does not leak into parent', () => {
    // Bug: the inactive-conditional fast-path (if !conditionals.isActive()) unconditionally pushed
    // the raw include:: line to out[] without checking emit, so the directive leaked into the parent
    // where Asciidoctor would try to resolve it.
    const files = {
      'main.adoc': '= Doc\n\ninclude::child.adoc[]\n\nParent prose.\n',
      'child.adoc': ':attr: value\n\nifdef::undefined-flag[]\ninclude::secret.adoc[]\nendif::[]\n',
      'secret.adoc': 'Secret content.\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), {
      showIncludes: false,
    });

    expect(content).not.toContain('include::secret.adoc');
    expect(content).not.toContain('Secret content.');
    expect(content).toContain('Parent prose.');
    expect(unresolved).toEqual([]);
  });

  // ── Scenario 5c: inline-cond include form in hidden child does not leak ───────────────────────
  test('a single-line ifdef::flag[include::...] form in a hidden child does not leak into parent', () => {
    // Bug: the inlineCond branch unconditionally pushed the directive line to out[] before the
    // emit guard, so `ifdef::flag[include::sub.adoc[]]` from a hidden child leaked into the parent.
    const files = {
      'main.adoc': '= Doc\n\ninclude::child.adoc[]\n\nParent prose.\n',
      'child.adoc': ':attr: value\n\nifdef::flag[include::sub.adoc[]]\n',
      'sub.adoc': 'Sub content.\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files), { showIncludes: false });

    expect(content).not.toContain('ifdef::flag[include::sub.adoc[]]');
    expect(content).not.toContain('Sub content.');
    expect(content).toContain('Parent prose.');
    expect(content).toContain(':attr: value');
  });

  // ── Scenario 5d: backslash-escaped {attr} refs survive unchanged in hide mode ─────────────────
  test(String.raw`\{name} (escaped attribute reference) is not expanded in hide mode prose`, () => {
    // Bug: substitutePathAttributes had no escape awareness — \{foo} was expanded as {foo}.
    // In AsciiDoc \{foo} in source renders as literal {foo} (Asciidoctor strips the backslash).
    // The assembler must leave \{foo} untouched so Asciidoctor handles it correctly.
    const files = {
      'main.adoc': String.raw`= Doc

include::child.adoc[]

Literal: \{product-name}
Resolved: {product-name}
`,
      'child.adoc': ':product-name: Acme\n',
    };
    const { content } = assembleIncludes('main.adoc', reader(files), { showIncludes: false });

    expect(content).toContain(String.raw`Literal: \{product-name}`);
    expect(content).toContain('Resolved: Acme');
  });

  // ── Scenario 5: image directive inside a hidden include is dropped ────────────────────────────
  test('an image:: line inside a hidden include is dropped along with the rest of the body', () => {
    // Images inside a hidden include are suppressed with the include's body.
    // child.adoc contains an `image::` directive; with showIncludes:false that line
    // must not appear in the output — only the placeholder for child.adoc appears.
    const files = {
      'main.adoc': '= Manual\n\ninclude::child.adoc[]\n',
      'child.adoc': 'Some intro prose.\n\nimage::figure1.png[Figure 1]\n\nMore prose.\n',
    };
    const { content, unresolved } = assembleIncludes('main.adoc', reader(files), {
      showIncludes: false,
    });

    // The placeholder must appear.
    expect(content).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
    expect(content).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="child.adoc"`);

    // The image directive must NOT appear (it was inside the suppressed include body).
    expect(content).not.toContain('image::figure1.png');

    // Other prose from the child must also not appear.
    expect(content).not.toContain('Some intro prose.');
    expect(content).not.toContain('More prose.');

    expect(unresolved).toEqual([]);
  });
});
