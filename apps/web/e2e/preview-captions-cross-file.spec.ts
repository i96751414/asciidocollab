import { test, expect } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, setMainFile, openProject, openFile, expandPreview } from './helpers/editor';

// Caption/label/signifier family: the main file sets a
// localized `:table-caption:` and `:toc-title:` before including a child; the child's titled table
// and the document TOC use the inherited labels in the assembled preview.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fileId(page: import('@playwright/test').Page, projectId: string, name: string): Promise<string> {
  const tree = await page.request.get(`${API}/projects/${projectId}/files`).then((r) => r.json());
  const node = (tree.children as Array<{ id: string; name: string }>).find((c) => c.name === name);
  if (!node) throw new Error(`file ${name} not found`);
  return node.id;
}

test.describe('caption/label family across files', () => {
  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    projectId = await createProject(page, `Cross-File Captions ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('child table and TOC use the inherited localized table-caption / toc-title', async ({ page }) => {
    await createAdocFile(
      page,
      projectId,
      'main.adoc',
      '= Livro\n:toc:\n:toc-title: Conteudo\n:table-caption: Tabela\n\ninclude::child.adoc[]\n',
    );
    await createAdocFile(
      page,
      projectId,
      'child.adoc',
      '== Capitulo\n\n.Dados\n|===\n|a\n|===\n',
    );
    await setMainFile(page, projectId, await fileId(page, projectId, 'main.adoc'));

    await openProject(page, projectId);
    await openFile(page, 'main.adoc');
    await expandPreview(page);
    await page.getByTestId('show-includes-toggle').click();

    const output = page.getByTestId('asciidoc-output');
    // The titled table uses the inherited "Tabela" label, e.g. "Tabela 1. Dados".
    await expect(output.locator('caption.title')).toContainText('Tabela 1. Dados', { timeout: 15_000 });
    // The TOC title uses the inherited "Conteudo" label.
    await expect(output).toContainText('Conteudo');
  });
});
