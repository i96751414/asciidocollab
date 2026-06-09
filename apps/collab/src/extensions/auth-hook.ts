import type { Extension, onConnectPayload } from '@hocuspocus/server';
import type { Logger } from 'pino';
import { logCollabConnectionDenial } from '../audit-log-denial';

type FetchFunction = typeof globalThis.fetch;

/** Options for AuthHookExtension. */
export interface AuthHookOptions {
  /** Base URL of the apps/api internal server (for example, http://127.0.0.1:4001). */
  apiInternalUrl: string;
  /** Maximum milliseconds to wait for the auth endpoint before rejecting. */
  authTimeoutMs: number;
  /** Pino logger instance. */
  logger: Logger;
  /**
   * Allowlist of accepted WebSocket-handshake Origins (SEC2, CSWSH defence). An empty
   * list disables the check (development); in production it should list the web app origin(s).
   */
  allowedOrigins?: string[];
  /** Injectable fetch function (defaults to globalThis.fetch). */
  fetch?: FetchFunction;
}

const POLICY_VIOLATION = { code: 1008, reason: 'Policy Violation' };

/** Hocuspocus extension that validates each incoming WebSocket connection against the API auth endpoint. */
export class AuthHookExtension implements Extension {
  private readonly apiInternalUrl: string;
  private readonly authTimeoutMs: number;
  private readonly logger: Logger;
  private readonly allowedOrigins: string[];
  private readonly fetchFn: FetchFunction;

  /** Creates an AuthHookExtension with the given options. */
  constructor(options: AuthHookOptions) {
    this.apiInternalUrl = options.apiInternalUrl;
    this.authTimeoutMs = options.authTimeoutMs;
    this.logger = options.logger;
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  /** Rejects the connection, logging the denial with resource + reason (never the cookie). */
  private deny(documentName: string, reason: string): never {
    logCollabConnectionDenial(this.logger, { resource: documentName, reason });
    throw POLICY_VIOLATION;
  }

  /** Called by Hocuspocus for each new WebSocket connection; throws to reject. */
  async onConnect(payload: onConnectPayload): Promise<void> {
    const { documentName, requestHeaders } = payload;

    // SEC2: reject cross-site WebSocket hijacking attempts by enforcing an Origin allowlist
    // before doing any work. Skipped when no allowlist is configured (development).
    if (this.allowedOrigins.length > 0) {
      const originRaw = requestHeaders.origin ?? requestHeaders.Origin;
      const origin = Array.isArray(originRaw) ? originRaw[0] : originRaw;
      if (!origin || !this.allowedOrigins.includes(origin)) {
        this.deny(documentName, 'origin_not_allowed');
      }
    }

    const cookieRaw = requestHeaders.cookie ?? requestHeaders.Cookie;
    const cookie = Array.isArray(cookieRaw) ? cookieRaw[0] : cookieRaw;
    const url = `${this.apiInternalUrl}/internal/collab/auth?documentName=${encodeURIComponent(documentName)}`;

    let response: Awaited<ReturnType<FetchFunction>>;
    try {
      response = await this.fetchFn(url, {
        signal: AbortSignal.timeout(this.authTimeoutMs),
        headers: cookie ? { Cookie: cookie } : {},
      });
    } catch (error) {
      const errorClass = error instanceof Error ? error.constructor.name : 'Error';
      this.logger.warn({ resource: documentName, reason: 'auth_unreachable', errorClass }, 'collab connection rejected');
      throw POLICY_VIOLATION;
    }

    if (response.status !== 200) {
      this.deny(documentName, `auth_status_${response.status}`);
    }

    const body: unknown = await response.json().catch(() => null);
    if (
      typeof body === 'object' &&
      body !== null &&
      'role' in body &&
      (body.role === 'editor' || body.role === 'observer') &&
      'userId' in body &&
      typeof body.userId === 'string'
    ) {
      payload.context.role = body.role;
      payload.context.userId = body.userId;
      // Enforce the read-only boundary at the WS layer (SEC2/FR-012): Hocuspocus rejects inbound
      // document updates on a read-only connection, so an observer cannot broadcast edits even by
      // bypassing the client. Client-side EditorState.readOnly alone is not an authz boundary.
      payload.connection.readOnly = body.role === 'observer';
      return;
    }
    this.deny(documentName, 'auth_malformed_response');
  }
}
