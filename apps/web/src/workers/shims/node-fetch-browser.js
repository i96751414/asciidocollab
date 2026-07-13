/**
 * @file Browser/worker stub for `node-fetch`, aliased in via Turbopack (`next.config.js`).
 *
 * `@citation-js/core`'s `util/fetchFile.js` imports `node-fetch` statically, but under a
 * `WorkerGlobalScope` (which exposes `location` and `navigator`) it detects a browser and uses the
 * native `fetch`/`Headers` globals instead — so these exports are never actually invoked. The stub
 * exists only to keep the real `node-fetch` (and its `fetch-blob` → `node:fs`/`node:net` chain, which
 * Turbopack cannot bundle for the browser) out of the client/worker module graph.
 */

// `fetchFile.js` imports only the default export and `Headers`; nothing else in the graph reaches
// `node-fetch`, so the stub exposes exactly those two.
const fetchStub = (...args) => globalThis.fetch(...args);

export default fetchStub;
export const Headers = globalThis.Headers;
