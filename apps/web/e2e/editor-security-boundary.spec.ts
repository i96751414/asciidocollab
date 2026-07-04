import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview, getEditorText } from './helpers/editor';

// Phase 16 / Constitution IX (security boundary): the editor + preview must never read outside the
// project sandbox and must never render untrusted markup as live HTML. The 429 rate-limit on the
// main-file / refactoring endpoints and the bounded symbol-index fan-out are proven
// at the route + hook unit layers; this spec covers the browser-observable boundaries.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function mainFileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('editor security boundary (Constitution IX)', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Security ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('rejects traversal, absolute and remote includes — never read, never rendered', async ({ page }) => {
    const MAIN =
      '= Book\n\ninclude::../secret.adoc[]\n\ninclude::/etc/passwd[]\n\ninclude::https://evil.example/x.adoc[]\n';
    await createAdocFile(page, projectId, 'main.adoc', MAIN);
    await setMainFile(page, projectId, await mainFileId(page, projectId, 'main.adoc'));

    // Fail loudly if the assembler ever tries to fetch the remote include target.
    const remoteHits: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('evil.example')) remoteHits.push(request.url());
    });

    await openProject(page, projectId);
    // Wait for the main file to sync before expanding the preview: an empty
    // pre-sync document schedules no render, so `asciidoc-output` would never
    // mount within expandPreview's budget under load.
    await openFile(page, 'main.adoc', 'Book');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    // Every out-of-sandbox target resolves to the "Unresolved directive" marker, not inlined content.
    await expect(output.getByText('Unresolved directive', { exact: false })).toHaveCount(3, { timeout: 15_000 });
    expect(remoteHits).toEqual([]);
  });

  test('sanitizes pasted HTML — no script executes and none survives into the preview', async ({ page }) => {
    await createAdocFile(page, projectId, 'paste.adoc', '= Doc\n\n');
    await setMainFile(page, projectId, await mainFileId(page, projectId, 'paste.adoc'));
    await openProject(page, projectId);
    await openFile(page, 'paste.adoc');

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData(
        'text/html',
        '<p>safe text</p><script>window.__xss = true;</script><img src="x" onerror="window.__xss = true">',
      );
      document
        .querySelector('.cm-content')
        ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // The visible prose is kept; the script payload is not present in the converted source.
    await expect.poll(async () => getEditorText(page)).toContain('safe text');
    const text = await getEditorText(page);
    expect(text).not.toContain('<script');
    expect(text).not.toContain('window.__xss');
    expect(text).not.toContain('onerror');

    await expandPreview(page);
    const output = page.getByTestId('asciidoc-output');
    await expect(output).toContainText('safe text', { timeout: 15_000 });
    // The rendered preview carries no executable <script>, and nothing set the XSS sentinel.
    await expect(output.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (globalThis as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
  });

  // Constitution IX (027): STEM math, conditional, and partial-include paths must not become a
  // sandbox-escape or script-injection vector. The cross-document feature added these paths; each
  // still routes through the single DOMPurify boundary, so no `<script>` may execute and no XSS
  // sentinel may be set, even when the markup is crafted to smuggle one.
  test('STEM math + conditionals + partial includes never execute injected script', async ({ page }) => {
    // The main file enables :stem: and gates an included partial on an attribute it sets, then a
    // tag-filtered include pulls a slice that embeds a crafted stem/passthrough payload. Asciidoctor
    // emits delimiters as plain text; the worker sanitizes; nothing executable may reach the DOM.
    const MAIN = [
      '= Book',
      ':stem:',
      ':feature:',
      '',
      'stem:[x^2] is inline math.',
      '',
      'ifdef::feature[]',
      'include::gated.adoc[]',
      'endif::[]',
      '',
      'include::partial.adoc[tags=keep]',
      '',
    ].join('\n');
    // A stem block + a passthrough block that tries to smuggle a <script>; both must end up inert.
    const GATED = [
      '[stem]',
      '++++',
      String.raw`\sqrt{x}`,
      '++++',
      '',
      '++++',
      '<script>window.__xss = true;</script>',
      '++++',
      '',
      'pass:[<img src=x onerror="window.__xss = true">]',
      '',
    ].join('\n');
    const PARTIAL = [
      '// tag::keep[]',
      String.raw`latexmath:[C_1 = \alpha] kept slice.`,
      '// end::keep[]',
      'Dropped slice.',
      '',
    ].join('\n');

    await createAdocFile(page, projectId, 'main.adoc', MAIN);
    await createAdocFile(page, projectId, 'gated.adoc', GATED);
    await createAdocFile(page, projectId, 'partial.adoc', PARTIAL);
    await setMainFile(page, projectId, await mainFileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    // Wait for the main file to sync before expanding the preview: an empty
    // pre-sync document schedules no render, so `asciidoc-output` would never
    // mount within expandPreview's budget under load.
    await openFile(page, 'main.adoc', 'Book');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    // The retained (active-branch, in-tag) content renders…
    await expect(output).toContainText('kept slice.', { timeout: 15_000 });
    // …while the dropped tag slice never reaches the preview.
    await expect(output).not.toContainText('Dropped slice.');
    // No executable script survives the sanitizer on ANY of these paths, and the XSS sentinel that
    // the smuggled <script>/onerror would have set stays unset — proving no sandbox escape.
    await expect(output.locator('script')).toHaveCount(0);
    await expect(output.locator('[onerror]')).toHaveCount(0);
    expect(await page.evaluate(() => (globalThis as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
  });
});
