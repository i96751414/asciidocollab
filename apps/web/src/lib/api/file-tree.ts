export { API_BASE_URL } from '@/lib/api/file-content';
import { API_BASE_URL } from '@/lib/api/file-content';
import type { FileTreeNode } from '@/components/file-tree/types';

/** Fetch a project's file tree (the root node with its nested children). */
export async function fetchProjectFileTree(projectId: string): Promise<FileTreeNode> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to load files');
  }
  return response.json();
}

/** Error thrown when a file tree API request fails with a structured error response. */
export class FileTreeApiError extends Error {
  /** Creates a FileTreeApiError with the HTTP status code, error code, message, and optional existing node ID for 409 conflicts. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly existingFileNodeId?: string,
  ) {
    super(message);
    this.name = 'FileTreeApiError';
  }
}

/** Creates a new folder in the file tree. Throws FileTreeApiError on failure. */
export async function createFolder(projectId: string, parentId: string, name: string): Promise<{ fileNodeId: string; path: string }> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'folder', parentId, name }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to create folder', body?.existingFileNodeId);
  }

  return response.json();
}

/** Creates a new file node in the file tree. */
export async function createFileNode(projectId: string, parentId: string, name: string, mimeType = 'text/asciidoc'): Promise<{ fileNodeId: string; path: string }> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'file', parentId, name, mimeType }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to create file');
  }

  return response.json();
}

/** Renames a file node. */
export async function renameFileNode(projectId: string, fileNodeId: string, name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to rename');
  }
}

/** Moves a file node to a new parent. */
export async function moveFileNode(projectId: string, fileNodeId: string, parentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to move');
  }
}

/** Deletes a file or folder. */
export async function deleteFileNode(projectId: string, fileNodeId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new FileTreeApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Failed to delete');
  }
}
