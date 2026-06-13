import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import {
  createAdocFile,
  openProject,
  openFile,
  getEditorText,
  foldGutterMarkers,
  foldPlaceholders,
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

  test('fold a section then unfold restores byte-identical content', async ({ page }) => {
    await createAdocFile(page, projectId, 'fold.adoc', DOC);
    await openProject(page, projectId);
    await openFile(page, 'fold.adoc');

    const before = await getEditorText(page);

    // A fold marker must be present on the section heading line; folding it
    // produces a collapsed placeholder.
    await expect(foldGutterMarkers(page).first()).toBeVisible();
    // Fold the first foldable region via the gutter.
    await foldGutterMarkers(page).nth(2).click();
    await expect(foldPlaceholders(page).first()).toBeVisible();

    // Unfold by clicking the placeholder; content must be unchanged.
    await foldPlaceholders(page).first().click();
    expect(await getEditorText(page)).toBe(before);
  });
});
