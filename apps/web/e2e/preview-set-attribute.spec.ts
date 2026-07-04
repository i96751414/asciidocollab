import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// FR-040 (inline `{set:}` attributes): an attribute defined inline with `{set:name:value}` must be
// recognized exactly like a `:name:` entry on BOTH surfaces — the preview renders the value (not the
// literal `{name}` / `{set:...}` token), and the editor recognizes the reference: it folds `{name}`
// to a `.cm-ad-attr-value` widget showing the value, and clicking the widget reveals the raw
// `{name}` carrying the `.cm-ad-attr-known` cross-document mark. Previously the editor extracted only
// `:name:` entries, so a `{set:}`-defined attribute was neither known nor folded.

const KNOWN = '.cm-ad-attr-known';

test.describe('FR-040 inline {set:} attribute recognized in preview + editor', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Set Attribute ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('an own-file {set:basedir:src/main} renders in the preview and folds in the editor', async ({ page }) => {
    const mainId = await createAdocFile(
      page,
      projectId,
      'set.adoc',
      '= Set Attribute\n\n{set:basedir:src/main}\n\nBuilt in {basedir} today.\n',
    );
    await setMainFile(page, projectId, mainId);
    await openProject(page, projectId);
    // Wait for the collaborative document to sync (known text present) before expanding: an empty
    // pre-sync document schedules no render, so `asciidoc-output` would never mount. The editor
    // content is a stronger sync signal than the connecting banner, whose absence is racy right
    // after mount (it can read 0 before the provider has even begun connecting).
    await openFile(page, 'set.adoc', 'Set Attribute');
    await expandPreview(page);

    // PREVIEW: Asciidoctor natively resolves `{set:}`, so the value renders and neither the reference
    // token nor the `{set:...}` directive survives as literal text.
    const output = page.getByTestId('asciidoc-output');
    await expect(output).toContainText('Built in src/main today.', { timeout: 15_000 });
    await expect(output).not.toContainText('{basedir}');
    await expect(output).not.toContainText('{set:');

    // EDITOR: the `{basedir}` reference is now recognized (it was defined via `{set:}`), so it folds
    // to its resolved value widget. Clicking the widget reveals the raw `{basedir}` source, which
    // carries the known cross-document mark.
    const valueWidget = page.locator('.cm-ad-attr-value', { hasText: 'src/main' });
    await expect(valueWidget).toBeVisible({ timeout: 10_000 });
    await valueWidget.click();
    await expect(page.locator('.cm-editor .cm-content')).toContainText('{basedir}');
    await expect(page.locator(KNOWN).first()).toBeVisible({ timeout: 10_000 });
  });

  test('a parent {set:} inherited by a child renders in the child preview', async ({ page }) => {
    // The main file defines :env: inline with `{set:}` before the include; the child references it.
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Book\n\n{set:env:prod}\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(page, projectId, 'child.adoc', '= Child\n\nRunning in {env} mode.\n');
    await setMainFile(page, projectId, await mainFileId(page, projectId));
    await openProject(page, projectId);
    // Wait for the child document to sync before expanding (see note above): an empty pre-sync
    // document schedules no preview render.
    await openFile(page, 'child.adoc', 'Running in');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    // The child preview resolves the parent's inline `{set:}` value (assembled at the include point).
    const output = page.getByTestId('asciidoc-output');
    await expect(output).toContainText('Running in prod mode.', { timeout: 15_000 });
    await expect(output).not.toContainText('{env}');
  });
});

/** Look up the main.adoc file id (the project root tree lists immediate children). */
async function mainFileId(page: import('@playwright/test').Page, projectId: string): Promise<string> {
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const tree = await page.request.get(`${api}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === 'main.adoc');
  if (!node) throw new Error('main.adoc not found');
  return node.id;
}
