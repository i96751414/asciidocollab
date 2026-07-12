// Unit tests for the worker's WOFF2 font converter. `fonteditor-core` is mocked so the real Brotli/wasm
// codec never loads; these assert the wiring: lazy one-time init against the vendored same-origin wasm,
// the `window` stand-in a dedicated worker needs (and its cleanup), the decoded-sfnt passthrough, and
// memo reset so a failed init can be retried.

/* eslint-disable @typescript-eslint/no-explicit-any -- the isolated-module handles are dynamically typed. */

jest.mock('fonteditor-core', () => ({
  woff2: {
    init: jest.fn(async () => undefined),
    decode: jest.fn(() => new Uint8Array([0x00, 0x01, 0x00, 0x00])),
  },
}));

const WOFF2_BYTES = new Uint8Array([0x77, 0x4F, 0x46, 0x32]);
const DECODED_SFNT = new Uint8Array([0x00, 0x01, 0x00, 0x00]);

/** Freshly load the converter + its mocked codec so the module-level init memo starts empty per test. */
function load() {
  let converterModule: any;
  let fonteditor: any;
  jest.isolateModules(() => {
    converterModule = require('@/workers/woff2-font-converter');
    fonteditor = require('fonteditor-core');
  });
  return {
    createWoff2FontConverter: converterModule.createWoff2FontConverter as () => {
      woff2ToTtf: (bytes: Uint8Array) => Promise<Uint8Array>;
    },
    init: fonteditor.woff2.init as jest.Mock,
    decode: fonteditor.woff2.decode as jest.Mock,
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('createWoff2FontConverter', () => {
  it('inits the codec against the vendored same-origin wasm and returns the decoded sfnt', async () => {
    const { createWoff2FontConverter, init, decode } = load();

    const output = await createWoff2FontConverter().woff2ToTtf(WOFF2_BYTES);

    expect(init).toHaveBeenCalledWith('/vendor/woff2/woff2.wasm');
    // decode receives a standalone ArrayBuffer copy of the WOFF2 bytes (its accepted input shape).
    expect(new Uint8Array(decode.mock.calls[0][0] as ArrayBuffer)).toEqual(WOFF2_BYTES);
    expect(output).toEqual(DECODED_SFNT);
  });

  it('initializes the codec only once, reused across conversions and converter instances', async () => {
    const { createWoff2FontConverter, init } = load();

    const converter = createWoff2FontConverter();
    await converter.woff2ToTtf(WOFF2_BYTES);
    await converter.woff2ToTtf(WOFF2_BYTES);
    await createWoff2FontConverter().woff2ToTtf(WOFF2_BYTES);

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('exposes a self-referential window during init and removes it afterward (a worker has none)', async () => {
    const { createWoff2FontConverter, init } = load();
    let windowDuringInit: unknown;
    init.mockImplementation(async () => {
      windowDuringInit = (globalThis as any).window;
    });

    expect('window' in globalThis).toBe(false);
    await createWoff2FontConverter().woff2ToTtf(WOFF2_BYTES);

    expect(windowDuringInit).toBe(globalThis);
    expect('window' in globalThis).toBe(false);
  });

  it('leaves a pre-existing window untouched and restores it after init', async () => {
    const existingWindow = { marker: 'main-thread' };
    (globalThis as any).window = existingWindow;
    const { createWoff2FontConverter, init } = load();
    let windowDuringInit: unknown;
    init.mockImplementation(async () => {
      windowDuringInit = (globalThis as any).window;
    });

    await createWoff2FontConverter().woff2ToTtf(WOFF2_BYTES);

    expect(windowDuringInit).toBe(existingWindow);
    expect((globalThis as any).window).toBe(existingWindow);
  });

  it('rejects and clears the memo on init failure so a later font retries initialization', async () => {
    const { createWoff2FontConverter, init } = load();
    init.mockRejectedValueOnce(new Error('wasm load failed'));
    const converter = createWoff2FontConverter();

    await expect(converter.woff2ToTtf(WOFF2_BYTES)).rejects.toThrow('wasm load failed');

    // The default (resolving) init impl applies on the retry — init runs again rather than staying failed.
    const output = await converter.woff2ToTtf(WOFF2_BYTES);
    expect(init).toHaveBeenCalledTimes(2);
    expect(output).toEqual(DECODED_SFNT);
  });
});
