import { Page, Locator, expect } from '@playwright/test';
import { createTestFile } from './test-project';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Shared Playwright helpers for the AsciiDoc editor e2e specs (T005). These
 * drive the live CodeMirror surface — opening a project file, reading/typing
 * content, asserting token classes, folding, autocomplete, lint markers, and
 * active-file switches — so each per-story spec stays focused on its behaviour.
 */

/** Write file content through the existing REST file-content endpoint. */
export async function writeFileContent(
  page: Page,
  projectId: string,
  fileNodeId: string,
  content: string,
): Promise<void> {
  const response = await page.request.put(
    `${API_URL}/projects/${projectId}/files/${fileNodeId}/content`,
    { headers: { 'Content-Type': 'text/plain' }, data: content },
  );
  if (!response.ok()) {
    throw new Error(`writeFileContent failed: ${response.status()} ${await response.text()}`);
  }
}

/** Create an `.adoc` file with seeded content and return its node id. */
export async function createAdocFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
  parentId: string | null = null,
): Promise<string> {
  const fileNodeId = await createTestFile(page, projectId, parentId, name);
  await writeFileContent(page, projectId, fileNodeId, content);
  return fileNodeId;
}

/** Navigate to a project and wait until the initial loading indicator is gone. */
export async function openProject(page: Page, projectId: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
}

/** Open a file from the project tree and wait for the editor to mount. */
export async function openFile(page: Page, fileName: string): Promise<void> {
  await page.getByTestId(`tree-node-${fileName}`).click();
  await expect(editorContent(page)).toBeVisible({ timeout: 10_000 });
}

/** Locator for the CodeMirror editable content. */
export function editorContent(page: Page): Locator {
  return page.locator('.cm-editor .cm-content');
}

/** Read the full editor text by joining the rendered `.cm-line` elements. */
export async function getEditorText(page: Page): Promise<string> {
  const lines = await page.locator('.cm-editor .cm-line').allInnerTexts();
  return lines.join('\n');
}

/** Place the cursor at the end of the document and type `text`. */
export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await editorContent(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

/** Toggle the HTML preview open (expand) / closed. */
export async function expandPreview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /expand preview/i }).click();
  await expect(page.getByTestId('asciidoc-output')).toBeVisible({ timeout: 15_000 });
}

export async function collapsePreview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /collapse preview/i }).click();
}

/**
 * Assert that some highlighted token element with the given CSS class contains
 * `text`. Token classes are emitted by the AsciiDoc HighlightStyle (e.g.
 * `cm-ad-link`, `cm-ad-conditional`).
 */
export async function expectToken(page: Page, className: string, text: string): Promise<void> {
  await expect(
    page.locator(`.cm-content .${className}`, { hasText: text }).first(),
  ).toBeVisible({ timeout: 5000 });
}

/** Locator for the autocomplete listbox; trigger it with Ctrl+Space first. */
export function autocompleteList(page: Page): Locator {
  return page.locator('.cm-tooltip-autocomplete');
}

export async function triggerAutocomplete(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+Space');
  const list = autocompleteList(page);
  await expect(list).toBeVisible({ timeout: 5000 });
  return list;
}

/** Locator for lint underline ranges produced by `@codemirror/lint`. */
export function lintMarkers(page: Page): Locator {
  return page.locator('.cm-lintRange');
}

/** Locator for fold-gutter toggle markers. */
export function foldGutterMarkers(page: Page): Locator {
  return page.locator('.cm-foldGutter .cm-gutterElement');
}

/** Click the fold marker on a given 1-based editor line. */
export async function clickFoldOnLine(page: Page, lineNumber: number): Promise<void> {
  // Fold gutter elements align with line numbers; click the matching gutter cell.
  await foldGutterMarkers(page).nth(lineNumber).click();
}

/** Locator for collapsed fold placeholders. */
export function foldPlaceholders(page: Page): Locator {
  return page.locator('.cm-foldPlaceholder');
}

/** Assert that the named file is the active file in the tree (selected). */
export async function expectActiveFile(page: Page, fileName: string): Promise<void> {
  await expect(page.getByTestId(`tree-node-${fileName}`)).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 5000 },
  );
}
