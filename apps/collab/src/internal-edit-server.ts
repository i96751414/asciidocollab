import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Hocuspocus } from '@hocuspocus/server';
import type { Logger } from 'pino';
import type { ContentReplacement, YjsStateStore } from '@asciidocollab/domain';
import {
  applyEditsToDocument,
  readDocumentContent,
  type ApplyEditsRequest,
  type ReadContentRequest,
} from './apply-edits.js';

/** Path of the internal endpoint the API calls to rewrite references in live documents. */
export const APPLY_EDITS_PATH = '/internal/collab/apply-edits';

/** Path of the internal endpoint the API calls to read live document content. */
export const READ_CONTENT_PATH = '/internal/collab/read-content';

/** Header carrying the optional shared secret. */
const SECRET_HEADER = 'x-collab-internal-secret';

/** Hard cap on the request body, large enough for a project's worth of reference rewrites. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates and normalises an apply-edits request body. Returns null on any malformed input —
 * including non-UUID ids, which would otherwise produce a nonsensical room name.
 *
 * @param raw - The raw JSON request body.
 * @returns The parsed request, or null if invalid.
 */
export function parseApplyEditsBody(raw: string): ApplyEditsRequest | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const { projectId, yjsStateId, replacements } = json;
  if (typeof projectId !== 'string' || !UUID_REGEX.test(projectId)) return null;
  if (typeof yjsStateId !== 'string' || !UUID_REGEX.test(yjsStateId)) return null;
  if (!Array.isArray(replacements)) return null;

  const clean: ContentReplacement[] = [];
  for (const entry of replacements) {
    if (!isRecord(entry)) return null;
    const { find, replace } = entry;
    if (typeof find !== 'string' || typeof replace !== 'string') return null;
    clean.push({ find, replace });
  }
  return { projectId, yjsStateId, replacements: clean };
}

/**
 * Validates a read-content request body. Returns null on malformed input — including non-UUID ids.
 *
 * @param raw - The raw JSON request body.
 * @returns The parsed request, or null if invalid.
 */
export function parseReadContentBody(raw: string): ReadContentRequest | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const { projectId, yjsStateId } = json;
  if (typeof projectId !== 'string' || !UUID_REGEX.test(projectId)) return null;
  if (typeof yjsStateId !== 'string' || !UUID_REGEX.test(yjsStateId)) return null;
  return { projectId, yjsStateId };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        reject(new Error('payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/** Dependencies for the internal request handler. */
export interface ApplyEditsHandlerDeps {
  /**
   * Applies the parsed request to the live document.
   *
   * @param request - The validated apply-edits request.
   * @returns The number of occurrences replaced.
   */
  applyEdits: (request: ApplyEditsRequest) => Promise<number>;
  /**
   * Reads the live text of the document identified by the request.
   *
   * @param request - The validated read-content request.
   * @returns The current document text, or null when no live source exists (caller uses the file store).
   */
  readContent: (request: ReadContentRequest) => Promise<string | null>;
  /** Optional shared secret; when set, requests without a matching header are rejected (401). */
  secret?: string;
  /** Logger for failures. */
  logger: Logger;
}

/**
 * Builds the node HTTP request handler for the internal apply-edits and read-content endpoints.
 * Separated from the server so it can be unit-tested with injected functions.
 *
 * @param deps - The apply/read functions, optional secret, and logger.
 * @returns A node `http` request handler.
 */
export function createApplyEditsRequestHandler(
  deps: ApplyEditsHandlerDeps,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (request.method !== 'POST' || (path !== APPLY_EDITS_PATH && path !== READ_CONTENT_PATH)) {
      request.resume(); // drain any body so the keep-alive connection stays healthy
      response.writeHead(404).end();
      return;
    }
    if (deps.secret && request.headers[SECRET_HEADER] !== deps.secret) {
      request.resume();
      response.writeHead(401).end();
      return;
    }

    let raw: string;
    try {
      raw = await readBody(request);
    } catch {
      response.writeHead(413).end();
      return;
    }

    if (path === READ_CONTENT_PATH) {
      const parsed = parseReadContentBody(raw);
      if (!parsed) {
        response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid body' }));
        return;
      }
      try {
        const content = await deps.readContent(parsed);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ content }));
      } catch (error) {
        deps.logger.error({ err: error }, 'read-content failed');
        response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'read-content failed' }));
      }
      return;
    }

    const parsed = parseApplyEditsBody(raw);
    if (!parsed) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid body' }));
      return;
    }

    try {
      const applied = await deps.applyEdits(parsed);
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ applied }));
    } catch (error) {
      deps.logger.error({ err: error }, 'apply-edits failed');
      response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'apply-edits failed' }));
    }
  };
}

/** Inputs needed to start the loopback edit endpoint. */
export interface InternalEditServerOptions {
  /** The Hocuspocus instance that owns the live documents (apply uses direct connections; read uses the documents map). */
  hocuspocus: Pick<Hocuspocus, 'openDirectConnection' | 'documents'>;
  /** Store used by the read endpoint to decode a dormant room's persisted Yjs state without loading it. */
  yjsStateStore: YjsStateStore;
  /** Interface to bind to — defaults to loopback for safety. */
  host: string;
  /** Port to listen on. */
  port: number;
  /** Optional shared secret enforced on every request. */
  secret?: string;
  /** Optional server mTLS material; when set, the endpoint requires a valid API client certificate. */
  tls?: { cert: Buffer; key: Buffer; clientCa: Buffer };
  /** Logger. */
  logger: Logger;
}

/**
 * Starts the internal HTTP server that lets the API apply reference rewrites to live collaborative
 * documents (the Yjs source of truth). Binds to loopback by default; pair with a shared secret
 * and/or network policy in production. Returns the server so the caller can close it on shutdown.
 *
 * @param options - Hocuspocus instance, bind address, optional secret/mTLS, logger.
 * @returns The listening HTTP(S) server.
 */
export function startInternalEditServer(options: InternalEditServerOptions): http.Server {
  const handler = createApplyEditsRequestHandler({
    applyEdits: (request) => applyEditsToDocument(options.hocuspocus, request),
    readContent: (request) => readDocumentContent(options.hocuspocus, options.yjsStateStore, request),
    ...(options.secret ? { secret: options.secret } : {}),
    logger: options.logger,
  });
  const listener = (request: IncomingMessage, response: ServerResponse): void => {
    void handler(request, response);
  };
  // When mTLS material is provided, require a client certificate signed by the configured CA so the
  // mutation endpoint authenticates the API even off-loopback; otherwise plain HTTP on the bind host.
  const server = options.tls
    ? https.createServer(
        { requestCert: true, rejectUnauthorized: true, cert: options.tls.cert, key: options.tls.key, ca: options.tls.clientCa },
        listener,
      )
    : http.createServer(listener);
  server.listen(options.port, options.host, () => {
    options.logger.info({ port: options.port, host: options.host, tls: Boolean(options.tls) }, 'Collab internal edit server listening');
  });
  return server;
}
