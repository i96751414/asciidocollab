import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import {
  createAdocFile,
  openProject,
  openFile,
  foldPlaceholders,
  foldGutterMarkers,
} from './helpers/editor';

// US4 / FR-012–016: fold sections, delimited blocks, tables, conditionals,
// comment/attribute runs; unfold restores byte-identical text; a selection over
// a collapsed region copies the full hidden text (CM default).

const DOC = [
  '= Folding',
  '',
  '== Section One',
  '',
  'Body of section one that is long enough to fold.',
  '',
  '----',
  'code line a',
  'code line b',
  '----',
  '',
  '== Section Two',
  '',
  'Tail.',
  '',
].join('\n');

test.describe('US4 folding', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Folding ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('fold a region hides its body; unfold restores it (FR-012/015)', async ({ page }) => {
    await createAdocFile(page, projectId, 'fold.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'fold.adoc');

    const content = page.locator('.cm-editor .cm-content');
    await expect(content).toContainText('code line a');

    // Fold a region via its gutter toggle → a collapsed placeholder appears and
    // the body is hidden. Folding never edits the document (CM invariant; the
    // fold-range producers are unit-tested), so unfolding restores the content.
    await foldGutterMarkers(page).first().click();
    await expect(foldPlaceholders(page).first()).toBeVisible({ timeout: 5000 });
    await expect(content).not.toContainText('code line a');

    await foldPlaceholders(page).first().click();
    await expect(foldPlaceholders(page)).toHaveCount(0);
    await expect(content).toContainText('code line a');
    await expect(content).toContainText('Section Two');
  });
});
