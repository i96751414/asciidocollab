import type { Extension, onConnectPayload } from '@hocuspocus/server';
import type { Logger } from 'pino';

type FetchFunction = typeof globalThis.fetch;

/** Options for AuthHookExtension. */
export interface AuthHookOptions {
  /** Base URL of the apps/api internal server (for example, http://127.0.0.1:4001). */
  apiInternalUrl: string;
  /** Maximum milliseconds to wait for the auth endpoint before rejecting. */
  authTimeoutMs: number;
  /** Pino logger instance. */
  logger: Logger;
  /** Injectable fetch function (defaults to globalThis.fetch). */
  fetch?: FetchFunction;
}

const POLICY_VIOLATION = { code: 1008, reason: 'Policy Violation' };

/** Hocuspocus extension that validates each incoming WebSocket connection against the API auth endpoint. */
export class AuthHookExtension implements Extension {
  private readonly apiInternalUrl: string;
  private readonly authTimeoutMs: number;
  private readonly logger: Logger;
  private readonly fetchFn: FetchFunction;

  /** Creates an AuthHookExtension with the given options. */
  constructor(options: AuthHookOptions) {
    this.apiInternalUrl = options.apiInternalUrl;
    this.authTimeoutMs = options.authTimeoutMs;
    this.logger = options.logger;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  /** Called by Hocuspocus for each new WebSocket connection; throws to reject. */
  async onConnect(payload: onConnectPayload): Promise<void> {
    const { documentName, requestHeaders } = payload;
    const cookieRaw = requestHeaders.cookie ?? requestHeaders.Cookie;
    const cookie = Array.isArray(cookieRaw) ? cookieRaw[0] : cookieRaw;
    const url = `${this.apiInternalUrl}/internal/collab/auth?documentName=${encodeURIComponent(documentName)}`;

    try {
      const response = await this.fetchFn(url, {
        signal: AbortSignal.timeout(this.authTimeoutMs),
        headers: cookie ? { Cookie: cookie } : {},
      });

      if (response.status === 200) {
        const body: unknown = await response.json();
        if (
          typeof body === 'object' &&
          body !== null &&
          'role' in body &&
          (body.role === 'editor' || body.role === 'observer')
        ) {
          payload.context.role = body.role;
          return;
        }
        throw POLICY_VIOLATION;
      }

      throw POLICY_VIOLATION;
    } catch (error) {
      if (error === POLICY_VIOLATION) throw error;

      const errorClass = error instanceof Error ? error.constructor.name : 'Error';
      this.logger.warn(
        { documentName, errorClass },
        'Auth hook failed — rejecting connection',
      );
      throw POLICY_VIOLATION;
    }
  }
}
