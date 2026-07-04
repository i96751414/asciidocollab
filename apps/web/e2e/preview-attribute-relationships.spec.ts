import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Attribute relationships resolve mutually consistently in one render: a single assembled
// preview must reconcile SEVERAL interacting cross-document attributes at once —
//   1. `:idprefix:`/`:idseparator:` (set in the root) generate a heading's auto-ID;
//   2. an `:xrefstyle:`-styled `<<id>>` (style set in the root) targets THAT generated ID;
//   3. a titled table's caption uses a parent-defined `:table-caption:`;
//   4. a conditional is gated on an attribute SET IN AN INCLUDED file (the value flows up the tree).
// All four must resolve consistently in the one assembled document.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('preview attribute relationships resolve mutually consistently', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Attr Relationships ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('idprefix/xrefstyle/table-caption and an included-file flag all resolve in one preview', async ({ page }) => {
    // Root sets the ID-generation + xref styling + caption attributes, then includes a settings file
    // (which DEFINES the gating flag) and the content chapter. Asciidoctor processes attribute entries
    // in document order, so the settings include precedes the chapter that reads the flag.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      [
        '= Manual',
        ':idprefix: sect_',
        ':idseparator: -',
        ':xrefstyle: full',
        ':table-caption: Tabela',
        '',
        'include::settings.adoc[]',
        '',
        'include::chapter.adoc[]',
        '',
      ].join('\n'),
    );
    // The flag the chapter's conditional is gated on is SET in this included file (value flows up).
    await createAdocFile(page, projectId, 'settings.adoc', ':feature-enabled:\n');
    await createAdocFile(
      page,
      projectId,
      'chapter.adoc',
      [
        '== Target Section',
        '',
        'Intro.',
        '',
        '.Dados',
        '|===',
        '|a',
        '|===',
        '',
        'See <<sect_target-section>> for details.',
        '',
        'ifdef::feature-enabled[]',
        'Feature section is visible.',
        'endif::[]',
        '',
        'ifndef::feature-enabled[]',
        'Feature section is hidden.',
        'endif::[]',
        '',
      ].join('\n'),
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    // Open the MAIN file so the whole include tree is assembled and resolved together.
    // Wait for its content to sync before expanding: an empty pre-sync document
    // schedules no render, so `asciidoc-output` would never mount within
    // expandPreview's budget under load.
    await openFile(page, 'main.adoc', 'Manual');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');

    // (1) The heading's auto-ID uses the inherited idprefix/idseparator → `sect_target-section`.
    await expect(output.locator('#sect_target-section')).toHaveCount(1, { timeout: 15_000 });

    // (2) The `<<sect_target-section>>` xref resolves to that generated ID AND renders with the
    //     inherited `:xrefstyle: full` label (the "Section" signifier + title), proving the ID the
    //     prefix generated is the SAME ID the styled xref targets.
    const link = output.locator('a[href="#sect_target-section"]');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText('Section');
    await expect(link).toContainText('Target Section');

    // (3) The titled table's caption uses the parent-defined `:table-caption:` → "Tabela 1. Dados".
    await expect(output.locator('caption.title')).toContainText('Tabela 1. Dados');

    // (4) The conditional gated on the flag SET IN settings.adoc resolves active; its branch shows
    //     and the negated branch is hidden — consistent with the same resolved attribute state.
    await expect(output).toContainText('Feature section is visible.');
    await expect(output).not.toContainText('Feature section is hidden.');
  });
});
