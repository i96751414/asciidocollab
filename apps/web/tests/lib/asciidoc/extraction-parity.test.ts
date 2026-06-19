import * as web from '@/lib/asciidoc/extraction';
import * as domain from '@asciidocollab/domain';
import { resolveSandboxedPath } from '@/lib/asciidoc/sandbox-path';

// FR-006 / R9: the editor-side (presentation) extraction copy and the authoritative
// domain copy MUST resolve attributes and conditionals identically. This test runs
// both implementations over a shared fixture corpus and asserts equal results, so a
// rule change in one copy that is not mirrored in the other fails the gate.

const resolveInclude = (files: Record<string, string>) => (from: string, target: string) => {
  const resolved = resolveSandboxedPath(from, target);
  return resolved.ok && files[resolved.path] !== undefined ? resolved.path : null;
};

interface Fixture {
  name: string;
  files: Record<string, string>;
  rootFileId: string | null;
  fileId: string;
}

const fixtures: Fixture[] = [
  {
    name: 'standalone own attrs',
    files: { 'lone.adoc': ':a: 1\n:b: {a} two\n' },
    rootFileId: null,
    fileId: 'lone.adoc',
  },
  {
    name: 'inherited above include, not below; child own',
    files: {
      'main.adoc': ':env: prod\n\ninclude::child.adoc[]\n\n:after: late\n',
      'child.adoc': '= Child\n:local: x\n',
    },
    rootFileId: 'main.adoc',
    fileId: 'child.adoc',
  },
  {
    name: 'first-include inheritance wins',
    files: {
      'main.adoc': ':flag: one\n\ninclude::child.adoc[]\n\n:flag: two\n\ninclude::child.adoc[]\n',
      'child.adoc': 'uses {flag}\n',
    },
    rootFileId: 'main.adoc',
    fileId: 'child.adoc',
  },
  {
    name: 'unset across boundary',
    files: { 'main.adoc': ':env: prod\n:!env:\n\ninclude::child.adoc[]\n', 'child.adoc': '= Child\n' },
    rootFileId: 'main.adoc',
    fileId: 'child.adoc',
  },
  {
    name: 'inline set + soft default + wrapping',
    files: {
      'main.adoc': '{set:dyn:on}\n:msg: a \\\nb\n:theme: dark\n:theme: light@\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    },
    rootFileId: 'main.adoc',
    fileId: 'child.adoc',
  },
  {
    name: 'standalone inline {set:} own attribute (FR-040)',
    files: { 'lone.adoc': '{set:basedir:src/main}\nBuilt in {basedir}.\n' },
    rootFileId: null,
    fileId: 'lone.adoc',
  },
  {
    name: 'recursive include terminates',
    files: { 'a.adoc': ':x: 1\n\ninclude::b.adoc[]\n', 'b.adoc': ':y: 2\n\ninclude::a.adoc[]\n' },
    rootFileId: 'a.adoc',
    fileId: 'b.adoc',
  },
  {
    name: 'attribute defined inside a verbatim block does not pollute scope',
    files: { 'lone.adoc': ':real: yes\n\n----\n:fake: nope\n----\n' },
    rootFileId: null,
    fileId: 'lone.adoc',
  },
];

const toRecord = (scope: { values: ReadonlyMap<string, string>; origin: string }) => ({
  origin: scope.origin,
  values: Object.fromEntries([...scope.values.entries()].toSorted()),
});

describe('extraction parity (web vs domain)', () => {
  test.each(fixtures)('resolveAttributeScope agrees on "$name"', (fixture) => {
    const arguments_ = {
      rootFileId: fixture.rootFileId,
      fileId: fixture.fileId,
      readContent: (id: string) => fixture.files[id] ?? null,
      resolveInclude: resolveInclude(fixture.files),
    };
    expect(toRecord(web.resolveAttributeScope(arguments_))).toEqual(toRecord(domain.resolveAttributeScope(arguments_)));
  });

  test.each([
    'tags=a;b;!internal',
    'tags=*;!*',
    'leveloffset=+1',
    '',
  ])('parseIncludeTags agrees on %j', (attributes) => {
    expect(web.parseIncludeTags(attributes)).toEqual(domain.parseIncludeTags(attributes));
  });

  test.each([
    'lines=1;3..4',
    'lines=5..-1',
    'lines=2',
    'tags=a',
  ])('parseIncludeLines agrees on %j', (attributes) => {
    expect(web.parseIncludeLines(attributes)).toEqual(domain.parseIncludeLines(attributes));
  });

  test.each([
    'ifdef::a,b[]',
    'ifdef::a+b[]',
    'ifdef::a+b,c[]',
    'ifndef::draft[]',
    'ifeval::["{ver}" == "2"]',
    'ifeval::[{n} >= 3]',
    'ifeval::[{x} < beta]',
    'endif::[]',
    'plain prose',
  ])('parseConditional agrees on %j', (line) => {
    expect(web.parseConditional(line)).toEqual(domain.parseConditional(line));
  });

  test.each([
    {
      name: 'include option offset',
      files: { 'main.adoc': 'include::child.adoc[leveloffset=+1]\n', 'child.adoc': '= Child\n' },
      fileId: 'child.adoc',
    },
    {
      name: 'parent attribute-form offset above the include',
      files: { 'main.adoc': ':leveloffset: +2\n\ninclude::child.adoc[]\n', 'child.adoc': '== H\n' },
      fileId: 'child.adoc',
    },
    {
      name: 'include-scoped restoration across siblings',
      files: {
        'main.adoc': 'include::first.adoc[]\n\ninclude::second.adoc[]\n',
        'first.adoc': ':leveloffset: +1\n\n== A\n',
        'second.adoc': '== B\n',
      },
      fileId: 'second.adoc',
    },
    {
      // An empty/unparseable ifeval region must balance its endif so the later gated include is not
      // wrongly un-gated (finding #3). Both copies must agree it stays gated (offset 0, unreachable).
      name: 'empty ifeval does not desync the conditional stack',
      files: {
        'main.adoc': 'ifdef::flag[]\nifeval::[]\nendif::[]\ninclude::child.adoc[leveloffset=+1]\nendif::[]\n',
        'child.adoc': '== H\n',
      },
      fileId: 'child.adoc',
    },
  ])('effectiveLevelOffset agrees on "$name"', (fixture) => {
    const arguments_ = {
      rootFileId: 'main.adoc' as string | null,
      fileId: fixture.fileId,
      readContent: (id: string) => fixture.files[id] ?? null,
      resolveInclude: resolveInclude(fixture.files),
    };
    expect(web.effectiveLevelOffset(arguments_)).toBe(domain.effectiveLevelOffset(arguments_));
  });

  test('evaluateConditional agrees', () => {
    const scope = new Map([['ver', '2'], ['a', '1'], ['c', '1'], ['x', '3']]);
    for (const line of [
      'ifdef::a,b[]',
      'ifdef::a+b[]',
      'ifdef::a+b,c[]', // mixed-separator precedence (#8)
      'ifeval::["{ver}" == "2"]',
      'ifeval::[{ver} != 3]',
      'ifeval::[{x} < beta]', // mixed number/string ordering (#6)
    ]) {
      const w = web.parseConditional(line)!;
      const d = domain.parseConditional(line)!;
      expect(web.evaluateConditional(w, scope)).toBe(domain.evaluateConditional(d, scope));
    }
  });
});
