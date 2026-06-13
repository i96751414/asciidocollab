'use client';
import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { PREVIEW_DEBOUNCE_MS } from '@/lib/editor-config';
import { createRenderWorker } from '@/lib/create-render-worker';

/** Lifecycle state of the preview panel. */
export type PreviewState = 'idle' | 'pending' | 'rendering' | 'up-to-date' | 'error';

interface RenderRequest {
  requestId: number;
  content: string;
  imagesDir?: string;
  mainPath?: string;
  files?: Record<string, string>;
}

interface RenderResult {
  requestId: number;
  ok: boolean;
  html: string | null;
  error: string | null;
}

/**
 * A scroll request object. Each click in the editor produces a new instance so
 * React always sees a changed value even when the line number is the same.
 *
 * @param line - 1-based line number to scroll the preview to.
 */
export interface ScrollRequest {
  /** 1-based line number to scroll the preview to. */
  line: number;
}

/** Configuration controlling debounce delay and initial content for the AsciiDoc preview. */
export interface UseAsciidocPreviewOptions {
  /** Current AsciiDoc source text. Changing this resets the debounce and transitions state to pending. */
  content: string;
  /** True when the selected file is AsciiDoc and the preview panel is open. False transitions to idle. */
  isEnabled: boolean;
  /** When set, the hook scrolls the preview to the element with the matching data-source-line. */
  scrollToLine: ScrollRequest | null;
  /** Base path Asciidoctor prepends to relative image targets (the project's image endpoint). */
  imagesDir?: string;
  /**
   * Project-relative path of the configured main file. When set with {@link getFiles}, the preview
   * renders the assembled main document (includes inlined, sandbox-confined) instead of `content`
   * (FR-068). Leave unset to render the open file as-is (exact source-line scroll-sync).
   */
  mainPath?: string;
  /** Returns the path→content snapshot the include assembler needs; read lazily at render time. */
  getFiles?: () => Record<string, string>;
}

/** Return value of the `useAsciidocPreview` hook. */
export interface UseAsciidocPreviewResult {
  /** Latest successfully rendered HTML, or null before the first successful render. */
  html: string | null;
  /** Current lifecycle state. */
  state: PreviewState;
  /** Error message from the last failed render, or null. */
  error: string | null;
  /** Ref to attach to the preview scroll container. */
  previewRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Manages the Web Worker lifecycle, debounce timer, PreviewState machine, and
 * click-to-scroll.
 */
export function useAsciidocPreview({
  content,
  isEnabled,
  scrollToLine,
  imagesDir,
  mainPath,
  getFiles,
}: UseAsciidocPreviewOptions): UseAsciidocPreviewResult {
  const [state, setState] = useState<PreviewState>('idle');
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so the debounced render always posts the current base path without
  // re-running the debounce effects when it changes (it is stable per editor session).
  const imagesDirectoryReference = useRef(imagesDir);
  imagesDirectoryReference.current = imagesDir;
  // Include-assembly inputs, read lazily at render time (the files snapshot changes identity often).
  const mainPathReference = useRef(mainPath);
  mainPathReference.current = mainPath;
  const getFilesReference = useRef(getFiles);
  getFilesReference.current = getFiles;

  const workerReference = useRef<Worker | null>(null);
  const requestIdReference = useRef(0);
  const debounceReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewReference = useRef<HTMLDivElement | null>(null);

  // Mount Worker; teardown on unmount.
  useEffect(() => {
    const worker = createRenderWorker();
    workerReference.current = worker;

    worker.addEventListener('message', (event: MessageEvent<RenderResult>) => {
      const result = event.data;
      if (result.requestId !== requestIdReference.current) return; // stale

      if (result.ok && result.html !== null) {
        const sanitized = DOMPurify.sanitize(result.html, { USE_PROFILES: { html: true } });
        setHtml(sanitized);
        setError(null);
        setState('up-to-date');
      } else {
        setError(result.error);
        setState('error');
      }
    });

    return () => {
      worker.terminate();
      workerReference.current = null;
    };
  }, []);

  // Shared debounce helper — captured in effects via closure over current content.
  const scheduleRender = (currentContent: string) => {
    if (debounceReference.current !== null) clearTimeout(debounceReference.current);
    debounceReference.current = setTimeout(() => {
      debounceReference.current = null;
      requestIdReference.current += 1;
      setState('rendering');
      // When a main file is configured, assemble its include tree (FR-068); the worker confines
      // every target via resolveSandboxedPath and renders the assembled document.
      const mainFilePath = mainPathReference.current;
      const files = mainFilePath ? getFilesReference.current?.() : undefined;
      workerReference.current?.postMessage({
        requestId: requestIdReference.current,
        content: currentContent,
        imagesDir: imagesDirectoryReference.current,
        ...(mainFilePath && files ? { mainPath: mainFilePath, files } : {}),
      } satisfies RenderRequest);
    }, PREVIEW_DEBOUNCE_MS);
  };

  // Handle isEnabled changes.
  useEffect(() => {
    if (!isEnabled) {
      if (debounceReference.current !== null) {
        clearTimeout(debounceReference.current);
        debounceReference.current = null;
      }
      setState('idle');
      return;
    }
    if (!content) return;
    // Re-enabled with current content — start fresh render.
    setState('pending');
    scheduleRender(content);
  }, [isEnabled]);

  // Debounce content changes.
  useEffect(() => {
    if (!isEnabled || !content) return;
    setState('pending');
    scheduleRender(content);

    return () => {
      if (debounceReference.current !== null) {
        clearTimeout(debounceReference.current);
        debounceReference.current = null;
      }
    };
  }, [content]);

  // Re-render when the assembled-main view is toggled on/off (the open file became, or stopped
  // being, the configured main file) so the preview switches between assembled and open-file modes.
  useEffect(() => {
    if (!isEnabled || !content) return;
    scheduleRender(content);
  }, [mainPath]);

  // Scroll to line when scrollToLine changes.
  useEffect(() => {
    if (!scrollToLine || !previewReference.current) return;
    const { line } = scrollToLine;

    // Try exact match first, then fall back to largest line number ≤ line.
    let target = previewReference.current.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
    if (!target) {
      const all = previewReference.current.querySelectorAll<HTMLElement>('[data-source-line]');
      let best: HTMLElement | null = null;
      let bestLine = 0;
      for (const element of all) {
        const elementLine = Number(element.dataset['sourceLine']);
        if (elementLine <= line && elementLine > bestLine) {
          best = element;
          bestLine = elementLine;
        }
      }
      target = best;
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollToLine]);

  return { html, state, error, previewRef: previewReference };
}
