import https from 'node:https';

/**
 * Creates a fetch-compatible function that presents a client certificate on every request (mutual
 * TLS). Used by api→collab internal calls so the collaboration server can authenticate the API.
 * Mirrors the collab-side client used for collab→api calls; kept here so the infrastructure layer
 * has no dependency on an app package.
 *
 * @param cert - PEM client certificate presented to the server.
 * @param key - PEM client private key.
 * @param ca - PEM CA certificate used to verify the server certificate.
 * @returns A `fetch`-compatible function.
 */
export function createMtlsFetch(cert: Buffer, key: Buffer, ca: Buffer): typeof globalThis.fetch {
  const agent = new https.Agent({ cert, key, ca, rejectUnauthorized: true });

  return async (input, init) => {
    const url =
      input instanceof URL
        ? input.href
        : (input instanceof Request ? input.url : String(input));

    const parsedUrl = new URL(url);
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        for (const [k, v] of init.headers.entries()) headers[k] = v;
      } else if (Array.isArray(init.headers)) {
        Object.assign(headers, Object.fromEntries(init.headers));
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const body = typeof init?.body === 'string' ? init.body : undefined;

    return new Promise<Response>((resolve, reject) => {
      const request = https.request(
        {
          hostname: parsedUrl.hostname,
          port: Number(parsedUrl.port) || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: (init?.method ?? 'GET').toUpperCase(),
          headers,
          agent,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => {
            const responseHeaders = new Headers();
            for (const [k, v] of Object.entries(response.headers)) {
              if (v !== undefined) responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
            }
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode ?? 200,
                headers: responseHeaders,
              }),
            );
          });
          response.on('error', reject);
        },
      );

      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          request.destroy();
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }

      request.on('error', reject);
      if (body !== undefined) request.write(body);
      request.end();
    });
  };
}
