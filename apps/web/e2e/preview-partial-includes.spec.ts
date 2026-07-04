import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Partial includes: a `tags=` and a `lines=` partial include
// each render ONLY their selected slice in the assembled PREVIEW (with `leveloffset` applied to the
// slice), while the non-selected content of the same child is absent. A non-matching selection
// renders gracefully (nothing) without breaking the surrounding document.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('partial includes by tags= / lines=', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Partial Includes ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('tags= selects only the named region (offset applied); lines= selects only the range', async ({ page }) => {
    // The child defines two tagged regions and several plain lines. The main file includes it twice:
    //  - once by `tags=intro` with `leveloffset=+1` (only the intro heading, shifted one level deeper),
    //  - once by `lines=` selecting only the standalone paragraph line.
    await createAdocFile(
      page,
      projectId,
      'snippets.adoc',
      [
        '// tag::intro[]',
        '== Intro Heading',
        '',
        'Intro paragraph text.',
        '// end::intro[]',
        '',
        'Standalone middle line.',
        '',
        '// tag::detail[]',
        '== Detail Heading',
        '',
        'Detail paragraph text.',
        '// end::detail[]',
        '',
      ].join('\n'),
    );
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      [
        '= Book',
        '',
        'include::snippets.adoc[tags=intro,leveloffset=+1]',
        '',
        'include::snippets.adoc[lines=7]',
        '',
      ].join('\n'),
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');

    // The `tags=intro` slice renders its heading shifted by +1 (raw level 1 ⇒ effective level 2 ⇒ <h3>)
    // and its paragraph; the `detail` region content is absent.
    await expect(output.locator('h3', { hasText: 'Intro Heading' })).toHaveCount(1, { timeout: 15_000 });
    await expect(output).toContainText('Intro paragraph text.');
    await expect(output.locator('text=Detail Heading')).toHaveCount(0);
    await expect(output).not.toContainText('Detail paragraph text.');

    // The `lines=7` slice renders only the standalone middle line (the tag marker comment lines and
    // the other content are excluded).
    await expect(output).toContainText('Standalone middle line.');
  });
});
