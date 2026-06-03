const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Fetches the raw text content of a document file. */
export async function getDocumentContent(projectId: string, fileNodeId: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}/content`,
    { credentials: 'include' },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Failed to fetch content: ${response.status}`);
  }

  return response.text();
}

/** Saves updated text content for a document file. */
export async function saveDocumentContent(projectId: string, fileNodeId: string, content: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/files/${fileNodeId}/content`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Failed to save content: ${response.status}`);
  }
}
