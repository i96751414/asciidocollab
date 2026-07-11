import type { CollabDocumentInfo } from '@asciidocollab/shared';
import { API_BASE_URL } from './file-content';

/** Builds the collaboration-info URL for a project file. */
export function collabDocumentInfoUrl(projectId: string, fileNodeId: string): string {
  return `${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}/collab`;
}

/**
 * Fetches the collaboration room id and the current user's role for a file.
 *
 * Returns `null` on 404, meaning the file has no backing collaborative document
 * such as a binary asset, so the caller falls back to the legacy REST load/save
 * path. Throws on any other non-ok status (401/403/5xx) so the caller can surface
 * or degrade explicitly rather than silently treating an auth failure as legacy.
 */
export async function getCollabDocumentInfo(
  projectId: string,
  fileNodeId: string,
): Promise<CollabDocumentInfo | null> {
  const response = await fetch(collabDocumentInfoUrl(projectId, fileNodeId), {
    credentials: 'include',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Failed to fetch collaboration info: ${response.status}`);
  }

  const data = await response.json();
  return { yjsStateId: data.yjsStateId, documentId: data.documentId, role: data.role };
}
