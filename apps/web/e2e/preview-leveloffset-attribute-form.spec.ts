import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Regression: a NON-ROOT file that defines its OWN attribute-form `:leveloffset:` (as opposed to the
// include-OPTION form covered by preview-leveloffset-cross-file.spec.ts) must still render its section
// titles as headings when previewed on its own, at the depth inherited at its include point — NOT lose
// them. The bug: the preview seeded the file's END-of-document `:leveloffset:` (a large trailing `+10`)
// as a GLOBAL document attribute, shifting every `==` section past h6 so Asciidoctor emitted no heading
// at all. The fix seeds the include-POINT offset (effectiveLevelOffset) instead, and the editor resolves
// the same offset through the shared engine — so the preview heading tag and the editor heading-line
// class agree (R2).

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('leveloffset attribute-form in a non-root file', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Attr-Form Leveloffset ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('a child with its own trailing :leveloffset: +10 still renders headings at the inherited depth', async ({ page }) => {
    // The main file activates `:leveloffset: +1` (attribute form) above the include, so the child is
    // included at effective offset 1. The child's sections precede a large trailing `:leveloffset: +10`
    // whose only effect is on content AFTER it (there is none). The correct include-point offset is 1,
    // so `== Section One` (raw level 1) renders at effective level 2 ⇒ <h3>.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n\n:leveloffset: +1\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(
      page,
      projectId,
      'child.adoc',
      '== Section One\n\nBody text.\n\n== Section Two\n\n:leveloffset: +10\n',
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);

    // Open the CHILD as a non-root file and preview it on its own. Its sections must still be headings
    // — at the inherited in-context depth (<h3> for the inherited +1) — not erased into paragraph text.
    await openFile(page, 'child.adoc');
    await expandPreview(page);
    const output = page.getByTestId('asciidoc-output');
    await expect(output.locator('h3', { hasText: 'Section One' })).toHaveCount(1, { timeout: 15_000 });
    await expect(output.locator('h3', { hasText: 'Section Two' })).toHaveCount(1);
    // The trailing `:leveloffset: +10` must NOT have shifted the sections above it out of existence.
    await expect(output.getByRole('heading', { name: /Section/ })).toHaveCount(2);

    // R2: the editor styles the same section at the same effective level (2 ⇒ .cm-ad-h2), derived from
    // the shared offset engine — so the editor decoration and the preview heading tag agree.
    await expect(page.locator('.cm-line.cm-ad-h2', { hasText: 'Section One' })).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.cm-line.cm-ad-h1', { hasText: 'Section One' })).toHaveCount(0);
  });

  test('a non-root child that itself contains an option include composes offsets correctly', async ({ page }) => {
    // The child is included at effective offset 1 (parent `:leveloffset: +1`) and itself includes a
    // grandchild with `leveloffset=+1`. Ground truth (real Asciidoctor): Top=<h3> (1), G=<h4> (1+1),
    // Bottom=<h3> (back to the inherited 1). The assembler's absolute set/restore lines must COMPOSE
    // with the seeded include-point base, not reset it to 0 — otherwise G/Bottom render a level too
    // shallow.
    await createAdocFile(page, projectId, 'main.adoc', '= Book\n\n:leveloffset: +1\n\ninclude::child.adoc[]\n');
    await createAdocFile(
      page,
      projectId,
      'child.adoc',
      '== Top\n\ninclude::grand.adoc[leveloffset=+1]\n\n== Bottom\n',
    );
    await createAdocFile(page, projectId, 'grand.adoc', '== G\n\nGrand body.\n');
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'child.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();
    const output = page.getByTestId('asciidoc-output');
    await expect(output.locator('h3', { hasText: 'Top' })).toHaveCount(1, { timeout: 15_000 });
    await expect(output.locator('h4', { hasText: 'G' })).toHaveCount(1); // base 1 + option 1
    await expect(output.locator('h3', { hasText: 'Bottom' })).toHaveCount(1); // restored to the base, not 0
  });
});
