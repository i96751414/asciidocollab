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

/** A single cross-file usage of a symbol (FR-065 find-usages). */
export interface SymbolUsage {
  /** The file node containing the reference. */
  fileNodeId: string;
  /** The referencing file's project-relative path (no leading slash). */
  path: string;
  /** The kind of reference (`xref` / `attributeRef` / …). */
  kind: string;
  /** The reference's character offset range within its file. */
  range: { from: number; to: number };
}

/** The kind of symbol a rename targets (FR-064). */
export type RenameSymbolKind = 'anchor' | 'attribute';

/** Outcome of a successful project-wide symbol rename. */
export interface RenameSymbolResult {
  /** How many files were edited. */
  rewrittenFiles: number;
  /** How many individual occurrences were rewritten. */
  updatedReferences: number;
  /** Occurrences that could not be safely rewritten. */
  warnings: string[];
}

function refactoringError(response: Response, body: { error?: { message?: string; code?: string } }, fallback: string): Error & { status?: number; code?: string } {
  const error: Error & { status?: number; code?: string } = new Error(body?.error?.message ?? `${fallback}: ${response.status}`);
  error.status = response.status;
  error.code = body?.error?.code ?? 'REFACTORING_ERROR';
  return error;
}

/**
 * List every cross-file reference to a symbol (US12/FR-065) via
 * `GET /projects/:projectId/symbol-usages`. Requires project membership
 * (enforced server-side); a non-member surfaces as a thrown 403.
 *
 * @param projectId - The project to scan.
 * @param name - The section id / anchor / attribute name to find.
 * @returns The matching usages across the project's files.
 */
export async function findSymbolUsages(projectId: string, name: string): Promise<SymbolUsage[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/symbol-usages?name=${encodeURIComponent(name)}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    throw refactoringError(response, await response.json().catch(() => ({})), 'Find usages failed');
  }
  const parsed: { data: { usages: SymbolUsage[] } } = await response.json();
  return parsed.data.usages;
}

/**
 * Rename a section id / anchor / attribute and update every reference to it
 * across the project (US12/FR-064) via `POST /projects/:projectId/symbol-rename`.
 * Requires editor/owner (enforced server-side); a 403 or a 400 (invalid name /
 * merge conflict) surfaces as a thrown error carrying `status`/`code`.
 *
 * @param projectId - The project to refactor.
 * @param input - The symbol kind and old/new names.
 * @returns The rename outcome (files changed, occurrences rewritten, warnings).
 */
export async function renameSymbol(
  projectId: string,
  input: { symbolKind: RenameSymbolKind; oldName: string; newName: string },
): Promise<RenameSymbolResult> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/symbol-rename`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw refactoringError(response, await response.json().catch(() => ({})), 'Rename failed');
  }
  const parsed: { data: RenameSymbolResult } = await response.json();
  return parsed.data;
}
