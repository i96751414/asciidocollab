import { existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { ensureTestUser } from './helpers/test-user';
import { signIn, createProject, cleanupProject } from './helpers/test-project';
import { createAdocFile, openProject, openFile, editorContent, getEditorText } from './helpers/editor';

// The live PDF preview renders the document inside a Web Worker (the vendored asciidoctor-pdf wasm),
// so a render — however heavy — must never block the editor's main thread. These specs exercise that
// guarantee end to end: while the preview is (re)rendering, the editor keeps accepting input with no
// long main-thread stall, and the panel re-renders to reflect further edits.

// Resolved from the app root (Playwright's testDir is ./e2e). Each vendored asset's presence is the
// signal that the corresponding stage can run for real: the wasm engine produces the PDF, and the
// pdf.js worker paints it onto the preview canvas. They are independent, so they gate independently.
const ENGINE_WASM_PATH = path.join(
  process.cwd(),
  'public',
  'vendor',
  'asciidoctor-pdf',
  'asciidoctor-pdf.wasm',
);
const PDF_WORKER_PATH = path.join(process.cwd(), 'public', 'vendor', 'pdfjs', 'pdf.worker.min.mjs');
const enginePresent = existsSync(ENGINE_WASM_PATH);
const pdfWorkerPresent = existsSync(PDF_WORKER_PATH);

const ENGINE_GATE_MESSAGE =
  'Asciidoctor-PDF wasm engine is not vendored (public/vendor/asciidoctor-pdf/asciidoctor-pdf.wasm). ' +
  'Build it (pnpm --filter @asciidocollab/asciidoc-pdf build:wasm) to run the live-preview checks.';
const PDF_WORKER_GATE_MESSAGE =
  'The pdf.js worker is not vendored (public/vendor/pdfjs/pdf.worker.min.mjs), so the preview canvas ' +
  'cannot be painted in this environment; the visual-repaint assertion is skipped.';

// Worst tolerated main-thread event-loop stall during an in-flight render. Sampling `setTimeout(0)`
// gaps on the main thread yields tens of milliseconds when work runs off-thread; a render executed
// synchronously on the main thread would stall it for the whole convert (hundreds of ms to seconds).
// 500 ms sits comfortably above normal timer jitter yet well below a blocking convert, so it cleanly
// distinguishes "rendered off-thread" from "froze the UI".
const MAX_MAIN_THREAD_STALL_MS = 500;

// A keystroke typed while a render is in flight must register in the editor within this budget. A
// frozen main thread would blow past it; a responsive one reflects the input near-instantly.
const INPUT_LATENCY_BUDGET_MS = 2000;

// Cold-start tolerant budgets. The first render must spin up the wasm VM (~300 ms cold plus convert),
// and each edit debounces before rendering; these govern how long we wait for a render to start and
// to settle — not how responsive the editor is meanwhile.
const RENDER_START_TIMEOUT_MS = 8000;
const RENDER_SETTLE_TIMEOUT_MS = 30_000;
// The very first render must download and instantiate the 68 MB wasm engine and boot its VM — a cold
// start that, on a machine still under load right after the stack builds, can take tens of seconds.
// Give it a wide budget (well inside the per-test timeout) so the first attempt is robust, not flaky.
const FIRST_RENDER_TIMEOUT_MS = 90_000;
const CANVAS_PAINT_TIMEOUT_MS = 30_000;
const PREVIEW_REPAINT_BUDGET_MS = 30_000;

// A never-painted HTML canvas reports the intrinsic default size; a painted PDF page is far larger.
const DEFAULT_CANVAS_WIDTH = 300;
const DEFAULT_CANVAS_HEIGHT = 150;

// Window keys the injected main-thread stall probe reads and writes. Passed into `page.evaluate` so
// the strings are declared once and never duplicated across the start/stop calls.
const probeKeys: { readonly maxKey: string; readonly runningKey: string } = {
  maxKey: 'editorMainThreadStallMaxMs',
  runningKey: 'editorMainThreadStallRunning',
};

const SEED_DOCUMENT =
  '= Live Preview Responsiveness\n\nInitial body paragraph for the responsiveness check.\n';

/** The PDF preview `<section aria-busy>`; matches only while a render is in flight. */
function renderInFlight(page: Page): Locator {
  return page.locator('[aria-label="PDF preview"][aria-busy="true"]');
}

/** The first `<canvas>` a rendered PDF page is painted into (the preview now stacks one per page). */
function previewCanvas(page: Page): Locator {
  return page.locator('[aria-label="PDF preview"] canvas').first();
}

/** The painted preview as a PNG data URL plus its intrinsic pixel size (all zero if not a canvas). */
async function readCanvas(page: Page): Promise<{ url: string; width: number; height: number }> {
  return previewCanvas(page).evaluate((element) =>
    element instanceof HTMLCanvasElement
      ? { url: element.toDataURL('image/png'), width: element.width, height: element.height }
      : { url: '', width: 0, height: 0 },
  );
}

/**
 * Begin sampling main-thread event-loop responsiveness. A self-rescheduling `setTimeout(0)` records
 * the largest gap between successive ticks; the gap grows only if the main thread is blocked. State
 * lives on the global object so {@link stopStallProbe} can read it from a separate evaluate.
 */
async function startStallProbe(page: Page): Promise<void> {
  await page.evaluate((keys) => {
    Reflect.set(globalThis, keys.maxKey, 0);
    Reflect.set(globalThis, keys.runningKey, true);
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const gap = now - last;
      last = now;
      const previous = Reflect.get(globalThis, keys.maxKey);
      if (typeof previous === 'number' && gap > previous) {
        Reflect.set(globalThis, keys.maxKey, gap);
      }
      if (Reflect.get(globalThis, keys.runningKey) === true) setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }, probeKeys);
}

/** Stop the probe and return the worst observed main-thread stall in milliseconds. */
async function stopStallProbe(page: Page): Promise<number> {
  return page.evaluate((keys): number => {
    Reflect.set(globalThis, keys.runningKey, false);
    const value = Reflect.get(globalThis, keys.maxKey);
    return typeof value === 'number' ? value : -1;
  }, probeKeys);
}

/** Append `text` at the end of the document (the collaborative editor is already editable here). */
async function typeAtDocumentEnd(page: Page, text: string): Promise<void> {
  await editorContent(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

/**
 * Seed a project file, open it, open the live PDF preview, and wait for the first render to produce a
 * PDF (the canvas un-hides once a blob exists) and settle. Returns the editor content locator.
 */
async function openEditorWithLivePreview(page: Page, projectId: string): Promise<Locator> {
  await createAdocFile(page, projectId, 'preview.adoc', SEED_DOCUMENT);
  await openProject(page, projectId);
  await openFile(page, 'preview.adoc', /Live Preview Responsiveness/);

  // The collaborative editor mounts read-only until its Yjs document syncs; typing before it is
  // editable is silently dropped. Wait for it to become editable before driving any input.
  const content = editorContent(page);
  await expect(content).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });

  // The PDF preview is a mode of the single shared preview panel: open the panel, then switch it to
  // PDF mode via the header toggle.
  await page.getByRole('button', { name: /expand preview/i }).click();
  await page.getByTestId('preview-mode-pdf').click();
  await expect(page.locator('[aria-label="PDF preview"]')).toBeVisible();
  // A produced PDF un-hides the canvas — the first engine render completed off-thread.
  await expect(previewCanvas(page)).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT_MS });
  await expect(renderInFlight(page)).toHaveCount(0, { timeout: RENDER_SETTLE_TIMEOUT_MS });
  return content;
}

test.describe('live PDF preview', () => {
  // Wide per-test budget: a cold wasm-engine start plus a burst of debounced re-renders.
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    await ensureTestUser();
  });

  let projectId: string;

  test.beforeEach(async ({ page }) => {
    // Gate: without the vendored wasm there is no engine to render with, so the preview never renders.
    // Skip with a clear message so environments lacking the (68 MB) engine stay green.
    test.skip(!enginePresent, ENGINE_GATE_MESSAGE);
    await signIn(page);
    projectId = await createProject(page, `PDF Preview Responsive ${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (projectId) await cleanupProject(page, projectId);
  });

  test('rapid edits never freeze the editor while the preview re-renders', async ({ page }) => {
    const content = await openEditorWithLivePreview(page, projectId);

    // Drive a burst of edits, each triggering a debounced re-render, and measure that the main thread
    // never stalls across the whole window. Every cycle waits for the render to actually be in flight,
    // then types a marker WHILE it renders and requires it to register promptly — a frozen main thread
    // could neither accept that input nor keep the event loop turning.
    await startStallProbe(page);

    const markers: string[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      await typeAtDocumentEnd(
        page,
        `\n\nAppended paragraph ${cycle} with enough text to give the worker real conversion work while the editor stays live.`,
      );

      // The edit debounces into a render; confirm one actually starts before probing responsiveness.
      await expect(renderInFlight(page)).toHaveCount(1, { timeout: RENDER_START_TIMEOUT_MS });

      // Type a distinctive marker while the render is in flight and require it to register quickly.
      const marker = `marker${cycle}End`;
      markers.push(marker);
      await page.keyboard.type(` ${marker}`);
      await expect(content, 'a keystroke typed during rendering must register promptly').toContainText(
        marker,
        { timeout: INPUT_LATENCY_BUDGET_MS },
      );

      // Let the render settle before the next cycle so each burst maps to its own render.
      await expect(renderInFlight(page)).toHaveCount(0, { timeout: RENDER_SETTLE_TIMEOUT_MS });
    }

    const worstStallMs = await stopStallProbe(page);
    expect(worstStallMs).toBeGreaterThanOrEqual(0); // the probe actually ran
    expect(
      worstStallMs,
      `main thread stalled ${worstStallMs} ms during rendering (budget ${MAX_MAIN_THREAD_STALL_MS} ms) — ` +
        'a render must not block the editor thread',
    ).toBeLessThan(MAX_MAIN_THREAD_STALL_MS);

    // Every keystroke across the burst registered — no dropped input, no freeze that lost characters.
    const finalText = await getEditorText(page);
    for (const marker of markers) {
      expect(finalText, 'all edits typed during rendering must be present in the editor').toContain(
        marker,
      );
    }

    // The panel reflects edits: a further distinct change drives a fresh render that the panel starts
    // and completes within budget. The render pipeline consumes the live edit overlay, so a new render
    // is a rendering of the changed document — the preview has updated in response to the edit.
    await typeAtDocumentEnd(page, '\n\nA closing paragraph that forces one more preview render.');
    await expect(renderInFlight(page)).toHaveCount(1, { timeout: RENDER_START_TIMEOUT_MS });
    await expect(renderInFlight(page)).toHaveCount(0, { timeout: RENDER_SETTLE_TIMEOUT_MS });
    await expect(previewCanvas(page)).toBeVisible();
  });

  test('the preview canvas repaints to reflect an edit', async ({ page }) => {
    // The pixel-level proof of "reflects the change" needs pdf.js to paint the produced PDF onto the
    // canvas. That worker is vendored independently of the engine, so gate it independently.
    test.skip(!pdfWorkerPresent, PDF_WORKER_GATE_MESSAGE);

    await openEditorWithLivePreview(page, projectId);

    // Wait until the first PDF page is actually painted (a real page dwarfs the default canvas size),
    // then snapshot its pixels as the pre-edit baseline.
    await expect
      .poll(
        async () => {
          const painted = await readCanvas(page);
          return painted.width;
        },
        {
          timeout: CANVAS_PAINT_TIMEOUT_MS,
          message: 'the pdf.js worker must paint the produced PDF onto the preview canvas',
        },
      )
      .toBeGreaterThan(DEFAULT_CANVAS_WIDTH);
    const baseline = await readCanvas(page);
    expect(baseline.height).toBeGreaterThan(DEFAULT_CANVAS_HEIGHT);

    // Change the document's opening heading — content that lands on the previewed first page — and
    // require the canvas to repaint to something different from the baseline within budget.
    await editorContent(page).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Home');
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');
    await page.keyboard.type('= Heading Changed By The Responsiveness Test');

    await expect
      .poll(
        async () => {
          const repainted = await readCanvas(page);
          return repainted.url;
        },
        {
          timeout: PREVIEW_REPAINT_BUDGET_MS,
          message: 'the PDF preview must repaint to reflect the edit',
        },
      )
      .not.toBe(baseline.url);
  });
});
