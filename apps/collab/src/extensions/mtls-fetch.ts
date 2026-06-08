import https from 'node:https';

/** Creates a fetch-compatible function that presents a client certificate on every request. */
export function createMtlsFetch(
  cert: Buffer,
  key: Buffer,
  ca: Buffer,
): typeof globalThis.fetch {
  const agent = new https.Agent({ cert, key, ca, rejectUnauthorized: true });

  return async (input, init) => {
    const url =
      input instanceof URL
        ? input.href
        : input instanceof Request
        ? input.url
        : String(input);

    const parsedUrl = new URL(url);
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers as [string, string][]) headers[k] = v;
      } else {
        Object.assign(headers, init.headers);
      }
    }

    return new Promise<Response>((resolve, reject) => {
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: Number(parsedUrl.port) || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: (init?.method ?? 'GET').toUpperCase(),
          headers,
          agent,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const responseHeaders = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
              }
            }
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 200,
                headers: responseHeaders,
              }),
            );
          });
          res.on('error', reject);
        },
      );

      if (init?.signal) {
        (init.signal as AbortSignal).addEventListener('abort', () => {
          req.destroy();
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }

      req.on('error', reject);
      req.end();
    });
  };
}
