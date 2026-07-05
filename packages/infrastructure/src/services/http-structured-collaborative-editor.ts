import type {
  StructuredCollaborativeEditor,
  StructuredReplacementSpec,
  ProjectId,
  YjsStateId,
  Result,
} from '@asciidocollab/domain';
import { createMtlsFetch } from './mtls-fetch';

/** Path of the internal structured-apply endpoint on the collaboration server. */
export const COLLAB_APPLY_STRUCTURED_REPLACEMENT_PATH = '/internal/collab/apply-structured-replacement';

// Strip trailing '/' characters. Linear-time (no regex) to keep it ReDoS-free.
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** Configuration for the HTTP structured-collaborative-editor adapter. */
export interface HttpStructuredCollaborativeEditorConfig {
  /** Base URL of the collaboration server's internal HTTP endpoint. */
  baseUrl: string;
  /** Optional shared secret sent as `x-collab-internal-secret`. */
  secret?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Client mTLS material; when set (and no explicit `fetch`), requests present this client certificate. */
  tls?: { cert: Buffer; key: Buffer; ca: Buffer };
  /** Injectable fetch (overrides `tls`); defaults to an mTLS fetch when `tls` is set, else the global fetch. */
  fetch?: typeof globalThis.fetch;
}

/**
 * {@link StructuredCollaborativeEditor} implementation that delegates to the collaboration server's
 * internal structured-apply endpoint. The collab server owns the live Yjs documents, so it is the
 * only process that can re-match and rewrite the source of truth (via `openDirectConnection`); this
 * adapter is the api-side client. Transport-only — no business logic.
 */
export class HttpStructuredCollaborativeEditor implements StructuredCollaborativeEditor {
  private readonly fetchImpl: typeof globalThis.fetch;

  /** @param config - Base URL, optional secret/timeout, and either mTLS material or an injected fetch. */
  constructor(private readonly config: HttpStructuredCollaborativeEditorConfig) {
    this.fetchImpl =
      config.fetch ?? (config.tls ? createMtlsFetch(config.tls.cert, config.tls.key, config.tls.ca) : globalThis.fetch);
  }

  /** Posts the spec to the collab server's structured-apply endpoint, returning the apply count. */
  async applyStructuredReplacement(
    projectId: ProjectId,
    yjsStateId: YjsStateId,
    spec: StructuredReplacementSpec,
  ): Promise<Result<number, Error>> {
    const url = `${stripTrailingSlashes(this.config.baseUrl)}${COLLAB_APPLY_STRUCTURED_REPLACEMENT_PATH}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.secret) headers['x-collab-internal-secret'] = this.config.secret;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: projectId.value,
          yjsStateId: yjsStateId.value,
          // The endpoint expects the domain query shape (`text`), not the DTO's `query` field.
          query: {
            text: spec.query.text,
            mode: spec.query.mode,
            caseSensitive: spec.query.caseSensitive,
            wholeWord: spec.query.wholeWord,
          },
          replacement: spec.replacement,
          selections: spec.selections.map((s) => ({ ordinal: s.ordinal, expectedText: s.expectedText })),
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5000),
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
    if (!response.ok) {
      return { success: false, error: new Error(`apply-structured-replacement failed with status ${response.status}`) };
    }

    // The endpoint reports how many occurrences it replaced; 0 means the live content diverged.
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('applied' in body) || typeof body.applied !== 'number') {
      return { success: false, error: new Error('apply-structured-replacement returned a malformed body') };
    }
    return { success: true, value: body.applied };
  }
}
