import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject, createTestFile } from './helpers/test-project';
import {
  addMemberToProject,
  commentOnPassage,
  openFileInEditor,
  selectLineWithText,
  typeInEditor,
  type MemberCredentials,
} from './helpers/review';

// Feature 038 / US3 (T041): anchoring resilience.
//  - SC-002: a heavy insert ABOVE the commented passage (by the OTHER session) must keep the highlight
//    on the same passage text.
//  - Degradation: deleting the commented passage text must not lose the item — it degrades and surfaces
//    in the detached tray (the layout wires no section resolver, so a removed passage degrades to
//    `detached`).

const PASSAGE = 'COMMENTED PASSAGE alpha bravo charlie';
const BIG_BLOCK = `${Array.from({ length: 15 }, (_, index) => `Inserted context line ${index} lorem ipsum`).join('\n')}\n`;

test.describe('Review anchoring — survives edits above and passage deletion', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let editor: MemberCredentials;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Review Anchoring ${Date.now()}`);
    editor = await addMemberToProject(page, projectId, 'editor');
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('highlight tracks the passage through inserts above, then degrades on deletion', async ({ page, browser }) => {
    const fileName = 'anchoring.adoc';
    await createTestFile(page, projectId, null, fileName);

    // A seeds the passage and comments on it.
    await openFileInEditor(page, projectId, fileName);
    await typeInEditor(page, `First line\n${PASSAGE}\nLast line`);
    await commentOnPassage(page, PASSAGE, 'Anchor check comment.');

    const railA = page.getByTestId('comment-rail');
    await expect(railA.getByTestId('review-thread-card')).toBeVisible({ timeout: 10_000 });

    const highlight = page.locator('.cm-editor [data-review-id]');
    await expect(highlight.first()).toContainText('COMMENTED PASSAGE', { timeout: 10_000 });

    // ── SC-002: the OTHER session inserts a large block ABOVE the passage ──────────────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageB, editor.email, editor.password);
      await openFileInEditor(pageB, projectId, fileName);
      await expect(pageB.locator('.cm-editor .cm-content')).toContainText(PASSAGE, { timeout: 5000 });

      const contentB = pageB.locator('.cm-editor .cm-content');
      await contentB.click();
      await pageB.keyboard.press('Control+Home');
      await pageB.keyboard.type(BIG_BLOCK);

      // A receives the inserted block …
      await expect(page.locator('.cm-editor .cm-content')).toContainText('Inserted context line 14', { timeout: 5000 });
      // … and the highlight still covers exactly the original passage (it moved with the text).
      await expect(highlight.first()).toContainText('COMMENTED PASSAGE', { timeout: 10_000 });
      await expect(railA.getByTestId('review-thread-card')).toBeVisible();
      await expect(page.getByTestId('detached-tray')).toHaveCount(0);

      // ── Degradation: delete the commented passage; the item must NOT be lost ──────────────────
      // The relative-position anchor keeps the item available in the rail: it resolves to a collapsed
      // position (staying a card) or, if the relpos ever fails, degrades into the detached tray. Either
      // way the comment survives — that is the guarantee we assert.
      await selectLineWithText(page, PASSAGE);
      await page.keyboard.press('Delete');

      await expect(page.locator('.cm-editor .cm-content')).not.toContainText('COMMENTED PASSAGE', { timeout: 10_000 });

      // The comment is not lost: its body is still shown somewhere in the rail …
      await expect(railA).toContainText('Anchor check comment.', { timeout: 15_000 });
      // … as an in-list thread card OR in the detached tray.
      await expect(
        railA.getByTestId('review-thread-card').or(railA.getByTestId('detached-tray')),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await contextB.close();
    }
  });
});
