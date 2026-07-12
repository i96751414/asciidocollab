/**
 * Fetch a project binary asset's bytes for the in-browser PDF pipeline. The HTML preview loads images
 * over HTTP from the API's per-path image endpoint; the offline PDF engine cannot, so its bytes are
 * fetched here (same origin, same session credentials) and mounted into the render VFS instead.
 *
 * Only assets the document already references (project-relative paths produced by the sandbox guard)
 * are ever passed in, so this never reaches an arbitrary remote URL — the no-egress invariant holds.
 */

/** Base URL of the Fastify backend, configurable via NEXT_PUBLIC_API_URL. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Build the API URL that serves a project asset by its project-relative path. Each path segment is
 * percent-encoded independently (preserving the `/` separators) so a path with spaces or other reserved
 * characters — e.g. `New Folder/Screenshot.png` — round-trips through the endpoint's per-segment decode.
 *
 * @param projectId - The project the asset belongs to.
 * @param path - The project-relative asset path (as the render engine resolves it).
 * @returns The absolute image-endpoint URL for the asset.
 */
export function projectAssetUrl(projectId: string, path: string): string {
  const encoded = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${API_BASE}/projects/${projectId}/images/${encoded}`;
}

/**
 * Fetch an asset's raw bytes. A missing/forbidden asset (any non-OK response) or a network failure is
 * WARNED and resolved as `null` rather than thrown, so one unavailable image can never break the whole
 * export/preview — the render pipeline then falls back to its not-found placeholder for just that image.
 *
 * @param projectId - The project the asset belongs to.
 * @param path - The project-relative asset path to fetch.
 * @returns The asset bytes, or `null` when it could not be fetched.
 */
export async function fetchProjectAsset(projectId: string, path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(projectAssetUrl(projectId, path), { credentials: 'include' });
    if (!response.ok) {
      // eslint-disable-next-line no-console -- a skipped asset must surface, never abort the render.
      console.warn(`PDF asset "${path}" could not be fetched (${response.status}); skipping.`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    // eslint-disable-next-line no-console -- a skipped asset must surface, never abort the render.
    console.warn(`PDF asset "${path}" fetch failed; skipping.`, error);
    return null;
  }
}
