/**
 * @file Browser/worker stub for `sync-fetch`, aliased in via Turbopack (`next.config.js`).
 *
 * `@citation-js/core`'s `util/fetchFile.js` imports `sync-fetch` for its SYNCHRONOUS `fetchFile`, a
 * code path this app never exercises (only the async CSL/BibTeX parsing runs, and only over the
 * local `.bib` text the shim already holds — never a URL). The real `sync-fetch` shells out via
 * `node:child_process`, which is impossible in a worker; this stub keeps it out of the bundle and
 * throws if the unused sync path is ever reached.
 */

function syncFetchStub() {
  throw new Error('sync-fetch is not available in the browser PDF worker.');
}

syncFetchStub.Headers = globalThis.Headers;

export default syncFetchStub;
