'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  isProgressMessage,
  isResultMessage,
  isErrorMessage,
  type FromWorker,
  type ProjectSnapshot,
  type RenderDiagnostic,
  type RenderError,
  type RenderPhase,
  type ToWorker,
} from '@asciidocollab/asciidoc-pdf';
import { createPdfWorker } from '@/lib/create-pdf-worker';

/** File extension of the produced document. */
const PDF_EXTENSION = '.pdf';
/** Download name when the root path has no usable basename. */
const DEFAULT_DOWNLOAD_NAME = 'document.pdf';
/** Stable empty reference so idle renders share one array identity. */
const NO_DIAGNOSTICS: readonly RenderDiagnostic[] = [];

/** The value and behaviour a one-click PDF export exposes to the UI. */
export interface UsePdfExportResult {
  /**
   * Kick off an export of the given snapshot. Supersedes any in-flight export: only the latest
   * request's result is honoured, and its PDF is downloaded automatically.
   *
   * @param snapshot - The project snapshot to render and download as a PDF.
   */
  exportPdf: (snapshot: ProjectSnapshot) => void;
  /** True from `exportPdf` until the matching result or a fatal error arrives. */
  isExporting: boolean;
  /** The most recent progress phase for the current export, when one has been reported. */
  phase?: RenderPhase;
  /** The fatal error from the last export, if it failed as a whole. */
  error?: RenderError;
  /** Non-fatal per-resource diagnostics carried by the last successful export. */
  diagnostics: readonly RenderDiagnostic[];
}

/** Derive a download filename from the render root path (basename with a `.pdf` extension). */
function downloadNameFor(rootPath: string): string {
  const base = rootPath.slice(rootPath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem === '' ? DEFAULT_DOWNLOAD_NAME : `${stem}${PDF_EXTENSION}`;
}

/** Trigger a browser download of a PDF blob via a transient object URL and `<a download>` click. */
function triggerDownload(pdf: Blob, fileName: string): void {
  const url = URL.createObjectURL(pdf);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The `requestId` a worker→main message pertains to, wherever it sits in the message shape. */
function requestIdOf(message: FromWorker): string {
  if (isResultMessage(message)) return message.result.requestId;
  if (isErrorMessage(message)) return message.error.requestId;
  return message.requestId;
}

/**
 * Drives a one-click, fully client-side PDF export. Owns ONE long-lived PDF Web Worker (created
 * lazily on mount, warmed ahead of the first export, reused across exports, terminated on unmount).
 *
 * Each `exportPdf` posts a render request tagged with a monotonic `requestId`; only the latest id is
 * honoured, so a superseded export's late `progress`/`result`/`error` messages are discarded (the
 * staleness guard mirrors {@link useAsciidocPreview}). A matching `result` downloads the PDF and
 * exposes its diagnostics; a matching `error` surfaces the failure. The UI supplies the snapshot and
 * renders the button/diagnostics from the returned state.
 */
export function usePdfExport(): UsePdfExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [phase, setPhase] = useState<RenderPhase | undefined>(undefined);
  const [error, setError] = useState<RenderError | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<readonly RenderDiagnostic[]>(NO_DIAGNOSTICS);

  const workerReference = useRef<Worker | null>(null);
  // Monotonic counter feeding the request id, and the latest id issued (the staleness key).
  const requestCounterReference = useRef(0);
  const latestRequestIdReference = useRef<string | null>(null);
  // The filename captured at request time, applied when that request's result comes back.
  const downloadNameReference = useRef(DEFAULT_DOWNLOAD_NAME);

  // Create the worker once, warm it, and tear it down on unmount.
  useEffect(() => {
    const worker = createPdfWorker();
    workerReference.current = worker;

    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (requestIdOf(message) !== latestRequestIdReference.current) return; // stale

      if (isProgressMessage(message)) {
        setPhase(message.phase);
        return;
      }
      if (isResultMessage(message)) {
        triggerDownload(message.result.pdf, downloadNameReference.current);
        setDiagnostics(message.result.diagnostics);
        setError(undefined);
        setIsExporting(false);
        return;
      }
      if (isErrorMessage(message)) {
        setError(message.error);
        setIsExporting(false);
      }
    });

    const warmup: ToWorker = { type: 'warmup' };
    worker.postMessage(warmup);

    return () => {
      worker.terminate();
      workerReference.current = null;
    };
  }, []);

  const exportPdf = useCallback((snapshot: ProjectSnapshot) => {
    const worker = workerReference.current;
    if (worker === null) return;

    requestCounterReference.current += 1;
    const requestId = String(requestCounterReference.current);
    latestRequestIdReference.current = requestId;
    downloadNameReference.current = downloadNameFor(snapshot.rootPath);

    setIsExporting(true);
    setPhase(undefined);
    setError(undefined);
    setDiagnostics(NO_DIAGNOSTICS);

    const message: ToWorker = {
      type: 'render',
      request: { requestId, mode: 'export', snapshot, optimize: true },
    };
    worker.postMessage(message);
  }, []);

  return { exportPdf, isExporting, phase, error, diagnostics };
}
