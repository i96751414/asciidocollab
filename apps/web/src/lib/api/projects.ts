import type { ProjectDto } from '@asciidocollab/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Set or clear a project's configured main AsciiDoc file (US8/FR-045) via
 * `PUT /projects/:projectId/main-file`. Passing null clears the configuration.
 * Authorization is enforced server-side in the use case (editors/owners only);
 * a 403 surfaces as a thrown error.
 *
 * @param projectId - The project to configure.
 * @param mainFileNodeId - The file node id to set as main, or null to clear.
 * @returns The updated project DTO.
 */
export async function setProjectMainFile(
  projectId: string,
  mainFileNodeId: string | null,
): Promise<ProjectDto> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/main-file`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFileNodeId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: Error & { status?: number; code?: string } = new Error(
      body?.error?.message ?? `Set main file failed: ${response.status}`,
    );
    error.status = response.status;
    error.code = body?.error?.code ?? 'SET_MAIN_FILE_ERROR';
    throw error;
  }

  const parsed: { data: ProjectDto } = await response.json();
  return parsed.data;
}
