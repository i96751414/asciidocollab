import { test, expect, Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import {
  signIn,
  createProject,
  cleanupProject,
  createTestFile,
} from './helpers/test-project';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// --- Setup helper -----------------------------------------------------------------------------

/** Seeds a file's content directly (scaffolding only). */
async function writeFileContent(page: Page, projectId: string, fileNodeId: string, content: string): Promise<void> {
  const response = await page.request.put(
    `${API_URL}/projects/${projectId}/files/${fileNodeId}/content`,
    { headers: { 'Content-Type': 'text/plain' }, data: content },
  );
  if (!response.ok()) {
    throw new Error(`writeFileContent failed: ${response.status()} ${await response.text()}`);
  }
}

const editorContent = (page: Page) => page.locator('.cm-editor .cm-content');

async function waitCollabSynced(page: Page): Promise<void> {
  await expect(page.getByTestId('collab-banner-connecting')).toHaveCount(0, { timeout: 30_000 });
}

async function openProject(page: Page, projectId: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
}

const railTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const outlineRow = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: /section outline/i }).getByRole('button', { name });

// --- Suite ------------------------------------------------------------------------------------

test.describe('Editor left panel: Outline view (028)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;
  let projectName: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectName = `Outline E2E ${Date.now()}`;
    projectId = await createProject(page, projectName);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  // US1 flagship: Files is the default; switch to Outline; the outline lists nested headings
  // including the title; clicking a heading moves the editor and the preview follows; and typing a
  // new heading makes a new outline row appear live (FR-007).
  test('default Files; switch to Outline; nested headings; navigate; live update', async ({ page }) => {
    test.setTimeout(75_000);
    const fileNodeId = await createTestFile(page, projectId, null, 'guide.adoc');
    await writeFileContent(
      page,
      projectId,
      fileNodeId,
      ['= Guide Title', '', '== Getting Started', '', '=== Install', '', 'Body text.', '', '== Reference', '', 'More body.'].join('\n'),
    );

    await openProject(page, projectId);
    await page.getByTestId('tree-node-guide.adoc').click();
    await waitCollabSynced(page);
    await expect(editorContent(page)).toContainText('Getting Started', { timeout: 20_000 });

    // Files is the default view: the file tree node is visible, the outline rail tab is not selected.
    await expect(page.getByTestId('tree-node-guide.adoc')).toBeVisible();
    await expect(railTab(page, /outline/i)).toHaveAttribute('aria-selected', 'false');

    // Switch to Outline via the rail.
    await railTab(page, /outline/i).click();
    await expect(railTab(page, /outline/i)).toHaveAttribute('aria-selected', 'true');

    // Every heading is listed, including the document title; nested by level.
    await expect(outlineRow(page, 'Guide Title')).toBeVisible();
    await expect(outlineRow(page, 'Getting Started')).toBeVisible();
    await expect(outlineRow(page, 'Install')).toBeVisible();
    await expect(outlineRow(page, 'Reference')).toBeVisible();

    // Open the preview, then click a deep heading: the editor moves there and the preview follows.
    await page.getByRole('button', { name: /expand preview/i }).click();
    await outlineRow(page, 'Reference').click();
    await expect(page.locator('.cm-editor .cm-activeLine')).toContainText('Reference', { timeout: 10_000 });

    // FR-007: typing a new section heading makes a new outline row appear without a manual refresh.
    await editorContent(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n== Appendix\n');
    await expect(outlineRow(page, 'Appendix')).toBeVisible({ timeout: 10_000 });
  });

  // US2: the current-section highlight follows the cursor (exactly one current row).
  test('current section highlight follows the cursor', async ({ page }) => {
    test.setTimeout(75_000);
    const fileNodeId = await createTestFile(page, projectId, null, 'sections.adoc');
    await writeFileContent(
      page,
      projectId,
      fileNodeId,
      ['= Doc', '', '== Alpha', '', 'Alpha body line.', '', '== Bravo', '', 'Bravo body line.'].join('\n'),
    );

    await openProject(page, projectId);
    await page.getByTestId('tree-node-sections.adoc').click();
    await waitCollabSynced(page);
    await expect(editorContent(page)).toContainText('Alpha body line.', { timeout: 20_000 });
    await railTab(page, /outline/i).click();

    // Cursor inside the Alpha section → Alpha is current.
    await editorContent(page).getByText('Alpha body line.').click();
    await expect(outlineRow(page, 'Alpha')).toHaveAttribute('aria-current', 'true', { timeout: 10_000 });
    await expect(page.getByRole('navigation', { name: /section outline/i }).locator('[aria-current="true"]')).toHaveCount(1);

    // Move into Bravo → the current row follows.
    await editorContent(page).getByText('Bravo body line.').click();
    await expect(outlineRow(page, 'Bravo')).toHaveAttribute('aria-current', 'true', { timeout: 10_000 });
    await expect(page.getByRole('navigation', { name: /section outline/i }).locator('[aria-current="true"]')).toHaveCount(1);
  });

  // US3: the chosen view persists across a reload (localStorage, per user, not the account API).
  test('the chosen Outline view persists across a reload', async ({ page }) => {
    test.setTimeout(75_000);
    const fileNodeId = await createTestFile(page, projectId, null, 'persist.adoc');
    await writeFileContent(page, projectId, fileNodeId, '= Persist\n\n== One\n');

    await openProject(page, projectId);
    await page.getByTestId('tree-node-persist.adoc').click();
    await waitCollabSynced(page);
    await railTab(page, /outline/i).click();
    await expect(railTab(page, /outline/i)).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 10_000 });
    // Outline is still the active view after the reload.
    await expect(railTab(page, /outline/i)).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  });

  // US4: graceful empty states.
  test('empty states: no document, then a heading-less document', async ({ page }) => {
    const fileNodeId = await createTestFile(page, projectId, null, 'flat.adoc');
    await writeFileContent(page, projectId, fileNodeId, 'Just a paragraph, no headings.\n');

    await openProject(page, projectId);
    // No document open yet → switch to Outline → first empty state.
    await railTab(page, /outline/i).click();
    await expect(page.getByText('Open a document to see its outline.')).toBeVisible({ timeout: 10_000 });

    // Switch back to Files (the file tree is hidden while Outline is active) to open a heading-less
    // document, then return to Outline → second empty state.
    await railTab(page, /files/i).click();
    await page.getByTestId('tree-node-flat.adoc').click();
    await waitCollabSynced(page);
    await railTab(page, /outline/i).click();
    await expect(page.getByText('No headings yet — add a section title (=, ==, …).')).toBeVisible({ timeout: 20_000 });
  });

  // US5: file create/options actions show only while Files is active.
  test('file actions are present on Files and absent on Outline', async ({ page }) => {
    const fileNodeId = await createTestFile(page, projectId, null, 'actions.adoc');
    await writeFileContent(page, projectId, fileNodeId, '= Actions\n\n== Heading\n');

    await openProject(page, projectId);
    await page.getByTestId('tree-node-actions.adoc').click();
    await waitCollabSynced(page);

    // Files view (default): the file-tree "actions" (⋯) control is visible.
    await expect(page.getByRole('button', { name: /^actions$/i }).first()).toBeVisible();

    // Outline view: the Files slot is hidden, so its actions are not visible.
    await railTab(page, /outline/i).click();
    await expect(page.getByRole('button', { name: /^actions$/i })).toHaveCount(0);

    // Switching back restores them.
    await railTab(page, /files/i).click();
    await expect(page.getByRole('button', { name: /^actions$/i }).first()).toBeVisible();
  });
});
