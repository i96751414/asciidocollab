/**
 * The concrete {@link FontConverter} supplied to the PDF pipeline's asset-mount stage at the worker
 * composition root. It decodes a custom WOFF2 project font back to the embeddable TTF/OTF sfnt it wraps,
 * because Asciidoctor-PDF/prawn embeds TTF/OTF only.
 *
 * The decode is LOSSLESS: `fonteditor-core`'s `woff2.decode` runs Google's WOFF2 decompressor (reversing
 * the Brotli compression and the glyf transform) and returns the exact sfnt bytes the font author
 * compressed — preserving its glyphs and `kern` table. It is NOT routed through fonteditor-core's `Font`
 * parse/serialize model, which would risk dropping tables the font's preparation depends on.
 *
 * The codec wasm is served same-origin from `/vendor/woff2/woff2.wasm` (vendored in predev/prebuild by
 * `scripts/build-woff2-wasm.mjs`), so no font bytes ever leave the browser — the no-egress invariant.
 */

import { woff2 } from 'fonteditor-core';
import type { FontConverter } from '@asciidocollab/asciidoc-pdf';

/** Same-origin URL of the vendored WOFF2 codec wasm. Keep in sync with `scripts/build-woff2-wasm.mjs`. */
const WOFF2_WASM_URL = '/vendor/woff2/woff2.wasm';

/** Copy a view into a standalone `ArrayBuffer` (the shape `woff2.decode` accepts). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Memoized codec initialization; cleared on failure so a later font can retry a transient load error. */
let initialization: Promise<void> | null = null;

/**
 * Initialize the WOFF2 codec once. `fonteditor-core` only wires its wasm URL through emscripten's
 * `locateFile` when `window` exists (its browser branch); a dedicated worker has no `window`, so a
 * minimal self-referential stand-in is exposed for the duration of init and removed immediately after,
 * so nothing else in the worker observes a `window`.
 */
function ensureCodecReady(): Promise<void> {
  if (initialization === null) {
    initialization = initializeCodec().catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

/** A typed view of the global scope's optional `window`, so init reads/writes it without a cast. */
function globalScope(): { window?: unknown } {
  return globalThis;
}

async function initializeCodec(): Promise<void> {
  const scope = globalScope();
  const hadWindow = 'window' in scope;
  const previousWindow = scope.window;
  if (!hadWindow) {
    scope.window = scope;
  }
  try {
    await woff2.init(WOFF2_WASM_URL);
  } finally {
    if (hadWindow) {
      scope.window = previousWindow;
    } else {
      delete scope.window;
    }
  }
}

/**
 * Build the worker's WOFF2→TTF/OTF font converter. Lazily initializes the codec on first use and decodes
 * each WOFF2 font to its embeddable sfnt; a load or decode failure rejects so the asset-mount stage can
 * fall the affected font back to the default with a `font-unavailable` diagnostic.
 */
export function createWoff2FontConverter(): FontConverter {
  return {
    async woff2ToTtf(bytes: Uint8Array): Promise<Uint8Array> {
      await ensureCodecReady();
      // `decode` decompresses the WOFF2 bytes and returns the sfnt (TTF/OTF) as a Uint8Array.
      return woff2.decode(toArrayBuffer(bytes));
    },
  };
}
