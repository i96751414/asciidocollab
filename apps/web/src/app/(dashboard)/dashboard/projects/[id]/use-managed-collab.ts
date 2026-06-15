'use client';
import { useEffect, useRef, useState } from 'react';
import { useCollabDocument, type ConnectionState } from '@/hooks/use-collab-document';
import { useProjectPresence } from '@/hooks/use-project-presence';
import { useCurrentUser } from '@/contexts/current-user-context';
import { getDocumentContent } from '@/lib/api/file-content';
import { getCollabDocumentInfo } from '@/lib/api/collab';
import type { CollabAuthRole } from '@asciidocollab/shared';
import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';
import type { CollabBinding } from '@/components/editor/asciidoc-editor';

interface ManagedCollabOptions {
  projectId: string;
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  canEdit: boolean;
}

interface ManagedCollab {
  /** Project-wide open-file presence map for the file tree (feature 024). */
  presenceByFile: ReturnType<typeof useProjectPresence>;
  /** Live collaboration binding for the selected file, or null off the collab path. */
  editorCollab: CollabBinding | null;
  /** True when the file is editable text with no collaborative document (read-only, no autosave). */
  collabUnavailable: boolean;
  /** Whether the editor may accept edits given the collaboration mode. */
  editorCanEdit: boolean;
  /** Content to render instead of contentState.content (offline read-only fallback). */
  editorContentOverride: string | null | undefined;
  /** Collaboration connection state for the editor's status banner, or undefined on the legacy path. */
  editorConnectionState: ConnectionState | undefined;
  /** True when the collab provider/Y.Doc or the offline buffer is not ready yet. */
  editorPending: boolean;
}

/**
 * Collaboration orchestration for the open file: the Yjs binding, mid-session role enforcement
 * (FR-012), the offline read-only fallback (FR-013), project-wide presence (feature 024), and the
 * editor props derived from the resulting collaboration mode (research D6 / EditorMode).
 */
export function useManagedCollab({
  projectId,
  selectedFile,
  contentState,
  canEdit,
}: ManagedCollabOptions): ManagedCollab {
  // Collaboration binding for the selected file. `contentState.collab` is set by useFileSelection
  // on the collab path (a backing collaborative document); otherwise this hook stays inert.
  const currentUser = useCurrentUser();
  const collabInfo = contentState.collab;
  const { doc, awareness, connectionState } = useCollabDocument({
    projectId,
    yjsStateId: collabInfo?.yjsStateId ?? '',
    enabled: collabInfo != null,
    user: { userId: currentUser.userId, name: currentUser.displayName },
  });

  // Feature 024: project-wide open-file presence for the file tree. Joins a lightweight presence
  // room to publish which file this user has open and observe which files others have open.
  const presenceByFile = useProjectPresence({
    projectId,
    enabled: true,
    user: { userId: currentUser.userId, name: currentUser.displayName },
    // "Open" means a collaborative document is open in the editor — gate on collabInfo so a selected
    // folder (or a legacy/non-collab file) is never advertised as the viewer's open file.
    openFileNodeId: collabInfo ? (selectedFile?.nodeId ?? null) : null,
  });

  // Mid-session role enforcement (FR-012 / edge case "permission change mid-session"): the role
  // is re-checked on reconnect, so a user demoted to viewer flips to read-only without a reload.
  const [liveRole, setLiveRole] = useState<CollabAuthRole | null>(null);
  useEffect(() => {
    setLiveRole(collabInfo?.role ?? null);
  }, [collabInfo?.yjsStateId, collabInfo?.role]);
  const previousConnectionReference = useRef<ConnectionState>(connectionState);
  useEffect(() => {
    const previous = previousConnectionReference.current;
    previousConnectionReference.current = connectionState;
    if (collabInfo && selectedFile && previous === 'reconnecting' && connectionState === 'synced') {
      getCollabDocumentInfo(projectId, selectedFile.nodeId)
        .then((info) => { if (info) setLiveRole(info.role); })
        .catch(() => { /* keep the current role; the server still rejects observer writes */ });
    }
  }, [connectionState, collabInfo, selectedFile?.nodeId, projectId]);
  const effectiveRole: CollabAuthRole = liveRole ?? collabInfo?.role ?? 'editor';

  const collabBinding: CollabBinding | null =
    collabInfo && doc && awareness
      ? { doc, awareness, connectionState, role: effectiveRole, yjsStateId: collabInfo.yjsStateId }
      : null;
  // Collaborative file whose provider/Y.Doc has not been created yet — show a placeholder
  // rather than briefly mounting the legacy REST editor.
  const collabPending = collabInfo != null && collabBinding == null;

  // Offline fallback (FR-013): the collab server never synced within the timeout. Drop the
  // (empty) Yjs binding and open the file read-only, seeded from GET /content, with a banner —
  // no edits are accepted, so nothing is silently lost.
  const offline = collabInfo != null && connectionState === 'offline';
  const [offlineContent, setOfflineContent] = useState<string | null>(null);
  useEffect(() => {
    if (!offline || !selectedFile) {
      setOfflineContent(null);
      return;
    }
    let cancelled = false;
    getDocumentContent(projectId, selectedFile.nodeId)
      .then((text) => { if (!cancelled) setOfflineContent(text); })
      .catch(() => { if (!cancelled) setOfflineContent(''); });
    return () => { cancelled = true; };
  }, [offline, selectedFile?.nodeId, projectId]);

  // A text document with no collaborative backing (GET /collab 404) must open read-only — never
  // the legacy editable REST path, whose uncoordinated PUTs let clients overwrite each other.
  const collabUnavailable = contentState.collabUnavailable;

  // Editor props derived from the collaboration mode (research D6 / EditorMode).
  const editorCollab = offline ? null : collabBinding;
  const editorCanEdit = offline || collabUnavailable ? false : canEdit;
  const editorContentOverride = offline ? offlineContent : undefined;
  const editorConnectionState = collabInfo ? connectionState : undefined;
  const editorPending = collabPending || (offline && offlineContent === null);

  return {
    presenceByFile,
    editorCollab,
    collabUnavailable,
    editorCanEdit,
    editorContentOverride,
    editorConnectionState,
    editorPending,
  };
}
