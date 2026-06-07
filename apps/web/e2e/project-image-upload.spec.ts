import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';

// Minimal valid 1×1 PNG (67 bytes)
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0xe2, 0x21, 0xbc, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

test.describe('Image drag-and-drop upload', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Image Upload Test ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('drag-and-drop a PNG onto the file tree uploads it and shows it in the tree', async ({ page }) => {
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/failed to load files/i)).not.toBeVisible();

    const dropZone = page.getByTestId('file-tree-panel');
    await expect(dropZone).toBeVisible();

    // Build a DataTransfer carrying a PNG file and dispatch a drop event.
    // walkEntries falls back to getAsFile() when webkitGetAsEntry() is unavailable
    // in Playwright's synthetic drop events.
    const dataTransfer = await page.evaluateHandle((bytes: number[]) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(bytes)], 'test-upload.png', { type: 'image/png' });
      dt.items.add(file);
      return dt;
    }, [...MINIMAL_PNG]);

    await dropZone.dispatchEvent('drop', { dataTransfer });

    // Upload progress panel should appear showing the file name
    await expect(page.getByText('test-upload.png')).toBeVisible({ timeout: 5000 });

    // After the upload completes the file node should appear in the file tree
    await expect(
      page.getByTestId('tree-node-test-upload.png'),
      'Uploaded image should appear as a tree node after the drop',
    ).toBeVisible({ timeout: 10_000 });
  });

  test('selecting an uploaded image file shows an image preview', async ({ page }) => {
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByText(/loading\.\.\./i)).not.toBeVisible({ timeout: 8000 });

    const dropZone = page.getByTestId('file-tree-panel');

    const dataTransfer = await page.evaluateHandle((bytes: number[]) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(bytes)], 'preview-test.png', { type: 'image/png' });
      dt.items.add(file);
      return dt;
    }, [...MINIMAL_PNG]);

    await dropZone.dispatchEvent('drop', { dataTransfer });

    // Wait for tree node to appear
    const treeNode = page.getByTestId('tree-node-preview-test.png');
    await expect(treeNode).toBeVisible({ timeout: 10_000 });

    // Click the file in the tree
    await treeNode.click();

    // An <img> element should appear in the content area (image preview)
    const imgLocator = page.locator('[data-testid="content-panel"] img');
    await expect(
      imgLocator,
      'Clicking an image file should show an image preview',
    ).toBeVisible({ timeout: 5000 });

    // Verify the image actually loaded — naturalWidth > 0 means it is not a broken link.
    // The src points to the /projects/:id/files/:fileNodeId/content endpoint; a 404 would
    // leave naturalWidth at 0 even though the element is visible.
    await expect(async () => {
      const naturalWidth = await imgLocator.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(naturalWidth, 'Image naturalWidth must be > 0 (not a broken link)').toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });
});
