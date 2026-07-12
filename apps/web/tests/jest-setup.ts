import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom does not expose the TextEncoder/TextDecoder globals that Node and browsers provide. Modules
// that encode text to bytes at import time (e.g. the PDF package's VFS population) need them present
// before they load, so provide them here guarded (Node's test env already defines them globally).
if (typeof globalThis.TextEncoder !== 'function') {
  Object.defineProperty(globalThis, 'TextEncoder', { writable: true, value: TextEncoder });
}
if (typeof globalThis.TextDecoder !== 'function') {
  Object.defineProperty(globalThis, 'TextDecoder', { writable: true, value: TextDecoder });
}

// jsdom does not implement matchMedia; provide a safe default so components that
// read the OS colour-scheme preference (via useTheme) can render in tests. Tests
// that assert on specific media-query behaviour still override this locally.
if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
