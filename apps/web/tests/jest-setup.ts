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
