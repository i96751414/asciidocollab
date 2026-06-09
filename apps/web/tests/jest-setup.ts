import '@testing-library/jest-dom';

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

// jsdom has no fetch. Components that fire client requests from an effect (e.g.
// useTheme loading the saved preference) would otherwise throw in tests that do
// not care about networking. Provide a rejecting default — the callers already
// handle failure — while tests that exercise fetch still assign their own mock.
if (typeof globalThis.fetch !== 'function') {
  Object.defineProperty(globalThis, 'fetch', {
    writable: true,
    value: () => Promise.reject(new Error('fetch is not mocked in this test')),
  });
}
