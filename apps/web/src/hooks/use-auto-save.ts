import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AUTOSAVE_DEBOUNCE_MS,
  EXTERNAL_CHANGE_POLL_INTERVAL_MS,
  OFFLINE_QUEUE_KEY_PREFIX,
} from '@/lib/editor-config';
import { saveDocumentContent, fileContentUrl } from '@/lib/api/file-content';

/** Represents the current document save state in the editor. */
export type EditorSaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface UseAutoSaveOptions {
  projectId: string;
  fileNodeId: string;
  /**
   * Seed the ETag from the initial GET /content response so external-change
   *  polling works from first load, without requiring a save first.
   */
  initialEtag?: string;
  /**
   * When false, the hook is fully inert: no PUT saves, no ETag polling, no
   * localStorage drafts, no `beforeunload`/unmount keepalive. Used on the collab
   * path where the collaboration server owns persistence; `save()` is a
   * no-op. Defaults to true (legacy REST path).
   */
  enabled?: boolean;
  onExternalChange?: () => void;
  onDraftRecovered?: (content: string) => void;
}

/** Return value of the useAutoSave hook. */
interface UseAutoSaveResult {
  saveState: EditorSaveState;
  save: (content: string) => void;
}


/** Debounces document saves, tracks save state, handles offline queuing and draft recovery. */
export function useAutoSave({
  projectId,
  fileNodeId,
  initialEtag,
  enabled = true,
  onExternalChange,
  onDraftRecovered,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [saveState, setSaveState] = useState<EditorSaveState>('saved');
  const pendingContent = useRef<string | null>(null);
  // Counter instead of boolean so concurrent saves (debounce + retry overlap) don't
  // prematurely clear the in-flight guard when the first of two saves finishes.
  const savesInFlight = useRef(0);
  // Monotonically-increasing save generation. Each performSave captures its generation
  // on entry; the success/error path only runs if the generation still matches, ensuring
  // a stale in-flight retry cannot overwrite a more recent completed save.
  const saveGeneration = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const storedEtag = useRef<string | null>(initialEtag ?? null);

  const draftKey = OFFLINE_QUEUE_KEY_PREFIX + fileNodeId;
  const url = fileContentUrl(projectId, fileNodeId);

  const performSave = useCallback(async (content: string): Promise<void> => {
    saveGeneration.current += 1;
    const myGeneration = saveGeneration.current;
    savesInFlight.current += 1;
    setSaveState('saving');
    try {
      const { etag } = await saveDocumentContent(projectId, fileNodeId, content);
      // Discard stale results: a newer save already completed while this one was in-flight.
      if (myGeneration !== saveGeneration.current) return;
      if (etag) storedEtag.current = etag;
      localStorage.removeItem(draftKey);
      setSaveState('saved');
      pendingContent.current = null;
    } catch {
      if (myGeneration !== saveGeneration.current) return;
      localStorage.setItem(draftKey, content);
      setSaveState('error');
      scheduleRetry(content);
    } finally {
      savesInFlight.current -= 1;
    }
  }, [projectId, fileNodeId, draftKey]);

  function scheduleRetry(content: string) {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    // Capture generation at arm time — if a newer save starts before the timer
    // fires, the retry is stale and must not send old content to the server.
    const genAtArm = saveGeneration.current;
    retryTimer.current = setTimeout(() => {
      if (saveGeneration.current !== genAtArm) return;
      void performSave(content);
    }, 5000);
  }

  const save = useCallback((content: string) => {
    // Collab path: the collaboration server owns persistence — never PUT.
    if (!enabled) return;
    if (!navigator.onLine) {
      // Bump the generation so any in-flight save's generation guard fires and
      // it cannot removeItem the draft we are about to write.
      saveGeneration.current += 1;
      pendingContent.current = content;
      setSaveState('unsaved');
      localStorage.setItem(draftKey, content);
      return;
    }
    pendingContent.current = content;
    setSaveState('unsaved');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // Cancel any pending retry so a new debounce-triggered save is the only in-flight PUT.
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    debounceTimer.current = setTimeout(() => {
      void performSave(content);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [enabled, draftKey, performSave]);

  // beforeunload: dispatch keepalive fetch if unsaved
  useEffect(() => {
    if (!enabled) return;
    function handleBeforeUnload() {
      if (pendingContent.current !== null) {
        void fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          credentials: 'include',
          body: pendingContent.current,
          keepalive: true,
        });
      }
    }

    if (saveState === 'unsaved' || saveState === 'saving' || saveState === 'error') {
      globalThis.addEventListener('beforeunload', handleBeforeUnload);
      return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [enabled, saveState, url]);

  // Online/offline listeners
  useEffect(() => {
    if (!enabled) return;
    function handleOnline() {
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        // Cancel any pending retry — it would carry stale content and fire a redundant
        // PUT 5 s later even after the online-triggered save already succeeds.
        if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        // Do NOT remove the draft here — let performSave's success path remove it
        // (line: localStorage.removeItem(draftKey) in the try block). Removing it
        // before the save completes creates a window where a hard-kill loses the content.
        void performSave(draft);
      }
    }

    globalThis.addEventListener('online', handleOnline);
    return () => globalThis.removeEventListener('online', handleOnline);
  }, [enabled, draftKey, performSave]);

  // External change polling
  useEffect(() => {
    if (!enabled || !onExternalChange) return;
    pollTimer.current = setInterval(async () => {
      if (!storedEtag.current) return;
      // Skip polling while any save is in-flight: the server ETag will change as a result
      // of our own PUT, and a concurrent HEAD would spuriously call onExternalChange.
      if (savesInFlight.current > 0) return;
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: { 'If-None-Match': storedEtag.current },
          credentials: 'include',
        });
        if (response.ok && response.status === 200) {
          const newEtag = response.headers.get('ETag');
          if (newEtag && newEtag !== storedEtag.current) {
            storedEtag.current = newEtag;
            onExternalChange();
          }
        }
      } catch {
        // Polling errors are non-fatal
      }
    }, EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [enabled, url, onExternalChange]);

  // Draft recovery: runs on mount and whenever the target file changes.
  useEffect(() => {
    if (!enabled) return;
    const draft = localStorage.getItem(draftKey);
    if (draft && onDraftRecovered) {
      onDraftRecovered(draft);
    }
  }, [enabled, draftKey]); // onDraftRecovered intentionally omitted: it is stable (useCallback) at call sites

  // Cancel debounce and retry timers when the target file (url) changes so
  // stale timers cannot fire against a stale URL after a file switch.
  // (pollTimer is handled by the polling effect's own cleanup when url changes.)
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [url]);

  // Cleanup all timers on unmount and FLUSH any unsaved content. In-app (SPA) navigation does
  // not fire `beforeunload`, so without this an edit made within the autosave debounce window is
  // silently lost when the user leaves the page (or switches files — the editor is keyed by node
  // id, so a switch unmounts this instance) before the debounce fires. The keepalive PUT is sent
  // immediately and outlives the unmount. `url` is stable for the lifetime of this editor instance.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (pendingContent.current !== null) {
        void fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          credentials: 'include',
          body: pendingContent.current,
          keepalive: true,
        }).catch(() => { /* best-effort flush; the offline draft path is the fallback */ });
        pendingContent.current = null;
      }
    };
  }, []); // url is stable for this editor instance; flush must run exactly once, on unmount

  return { saveState, save };
}
