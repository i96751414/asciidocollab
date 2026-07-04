import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, editorContent } from './helpers/editor';

// The editor highlights `{name}` references that resolve ANYWHERE in the
// include tree as known. A reference to an attribute defined only in a parent (including) file marks
// as known in the child, and a reference to an attribute defined only in an included child marks as
// known in the parent. The mark is the `cm-ad-attr-known` decoration. Because the resolved value is
// also collapsed-to-value for display, the test clicks the reference to reveal the raw source (the
// known mark stays on the revealed `{name}`).

const KNOWN = '.cm-ad-attr-known';

test.describe('Editor cross-document attribute highlighting', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Editor Cross-Doc Attrs ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('an attribute defined in a parent is highlighted as known in the child', async ({ page }) => {
    // main.adoc defines :productName: then includes child.adoc, which references {productName}.
    const childId = await createAdocFile(page, projectId, 'child.adoc', 'See {productName} today.\n');
    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      ':productName: Acme\ninclude::child.adoc[]\n',
    );
    await setMainFile(page, projectId, mainId);
    await openProject(page, projectId);
    await openFile(page, 'child.adoc');

    // The reference resolves cross-document, so the editor collapses {productName} to its resolved
    // value "Acme" (a .cm-ad-attr-value widget). Clicking the widget places the cursor on the
    // reference, revealing the raw {productName} source — which carries the known cross-document mark.
    const valueWidget = page.locator('.cm-ad-attr-value', { hasText: 'Acme' });
    await expect(valueWidget).toBeVisible({ timeout: 10_000 });
    await valueWidget.click();
    await expect(page.locator(KNOWN).first()).toBeVisible({ timeout: 10_000 });
    await expect(editorContent(page)).toContainText('{productName}');
    expect(childId).toBeTruthy();
  });

  test('an attribute defined in an included file is highlighted as known in the parent', async ({ page }) => {
    // child.adoc defines :edition:, main.adoc includes it and then references {edition}.
    await createAdocFile(page, projectId, 'child.adoc', ':edition: Pro\n');
    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      'include::child.adoc[]\nRunning {edition} edition.\n',
    );
    await setMainFile(page, projectId, mainId);
    await openProject(page, projectId);
    await openFile(page, 'main.adoc');

    // {edition} is defined in the included file → known anywhere in the tree. The root's
    // position-aware fold does not collapse a descendant's attribute, so {edition} stays raw source
    // and carries the known cross-document mark directly (no reveal needed).
    await expect(page.locator(KNOWN).first()).toBeVisible({ timeout: 10_000 });
  });

  test('an attribute defined in one included file is known in a sibling included AFTER it', async ({ page }) => {
    // main includes alpha.adoc THEN beta.adoc. alpha defines :sharedAttr:; beta — included after alpha
    // under the same parent — references {sharedAttr}. Because alpha is included before beta, its
    // definition is in scope (document order) where beta is assembled, so beta INHERITS it: the
    // reference resolves and collapses to the value "Acme". Revealing the source (click the value
    // widget) shows the raw {sharedAttr} carrying the known cross-document mark.
    await createAdocFile(page, projectId, 'alpha.adoc', ':sharedAttr: Acme\n');
    await createAdocFile(page, projectId, 'beta.adoc', 'Provided by {sharedAttr} today.\n');
    const mainId = await createAdocFile(
      page,
      projectId,
      'main.adoc',
      'include::alpha.adoc[]\ninclude::beta.adoc[]\n',
    );
    await setMainFile(page, projectId, mainId);
    await openProject(page, projectId);
    await openFile(page, 'beta.adoc');

    const valueWidget = page.locator('.cm-ad-attr-value', { hasText: 'Acme' });
    await expect(valueWidget).toBeVisible({ timeout: 10_000 });
    await valueWidget.click();
    await expect(page.locator(KNOWN).first()).toBeVisible({ timeout: 10_000 });
    await expect(editorContent(page)).toContainText('{sharedAttr}');
  });
});
