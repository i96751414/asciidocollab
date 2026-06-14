import type {
  CollaborativeContentEditor,
  ContentReplacement,
  ProjectId,
  YjsStateId,
  Result,
} from '@asciidocollab/domain';
import { createMtlsFetch } from './mtls-fetch';

/** Path of the internal apply-edits endpoint on the collaboration server. */
export const COLLAB_APPLY_EDITS_PATH = '/internal/collab/apply-edits';

/** Configuration for the HTTP collaborative-content editor adapter. */
export interface HttpCollaborativeContentEditorConfig {
  /** Base URL of the collaboration server's internal HTTP endpoint (e.g., `http://127.0.0.1:4003`). */
  baseUrl: string;
  /** Optional shared secret sent as `x-collab-internal-secret` (defense-in-depth on the loopback path). */
  secret?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Client mTLS material; when set (and no explicit `fetch`), requests present this client certificate. */
  tls?: { cert: Buffer; key: Buffer; ca: Buffer };
  /** Injectable fetch (overrides `tls`); defaults to an mTLS fetch when `tls` is set, else the global fetch. */
  fetch?: typeof globalThis.fetch;
}

/**
 * {@link CollaborativeContentEditor} implementation that delegates to the collaboration server over
 * an internal HTTP call. The collab server owns the live Yjs documents, so it is the only process
 * that can apply an edit to the source of truth (via `openDirectConnection`); this adapter is the
 * api-side client that asks it to. Transport-only — it carries no business logic.
 */
export class HttpCollaborativeContentEditor implements CollaborativeContentEditor {
  private readonly fetchImpl: typeof globalThis.fetch;

  /** @param config - Base URL, optional secret/timeout, and either mTLS material or an injected fetch. */
  constructor(private readonly config: HttpCollaborativeContentEditorConfig) {
    this.fetchImpl =
      config.fetch ?? (config.tls ? createMtlsFetch(config.tls.cert, config.tls.key, config.tls.ca) : globalThis.fetch);
  }

  /** Posts the replacements to the collab server's apply-edits endpoint. */
  async applyReplacements(
    projectId: ProjectId,
    yjsStateId: YjsStateId,
    replacements: ReadonlyArray<ContentReplacement>,
  ): Promise<Result<void, Error>> {
    if (replacements.length === 0) return { success: true, value: undefined };

    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${COLLAB_APPLY_EDITS_PATH}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.secret) headers['x-collab-internal-secret'] = this.config.secret;

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: projectId.value,
          yjsStateId: yjsStateId.value,
          replacements: replacements.map((r) => ({ find: r.find, replace: r.replace })),
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5000),
      });
      if (!response.ok) {
        return { success: false, error: new Error(`apply-edits failed with status ${response.status}`) };
      }
      return { success: true, value: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
