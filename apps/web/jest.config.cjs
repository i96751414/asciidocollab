/** @type {import('jest').Config} */

const sharedTransform = {
  // Transform .js too (with allowJs) so the generated Lezer parser (`asciidoc-parser.js`,
  // ESM) and the modules that import it can load under the commonjs jest runtime.
  '^.+\\.(ts|tsx|js)$': ['ts-jest', {
    tsconfig: {
      jsx: 'react-jsx',
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
      resolveJsonModule: true,
      allowJs: true,
      rootDir: '.',
      ignoreDeprecations: '6.0',
      paths: {
        '@/*': ['./src/*'],
      },
    },
  }],
};

const sharedModuleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  '\\.css$': '<rootDir>/tests/__mocks__/fileMock.cjs',
};

// Coverage measures application source only. Test infrastructure — Playwright
// e2e helpers and jest test helpers/mocks — is not application code and must
// not count toward (or against) the thresholds below. This is a project-level
// option, so it must live inside each project entry (not at the root).
const coveragePathIgnorePatterns = ['/node_modules/', '<rootDir>/e2e/', '<rootDir>/tests/'];

// Enforce coverage over ALL application source (matching the monorepo convention
// where domain/api/shared set `collectCoverageFrom: src/**`). Without this, the
// global threshold below only measures files a test happens to import, so a brand-new
// module with no test would silently pass the gate. This list is EXCLUSION-based
// (`src/**` then `!…`) so any newly-added file is counted by default — an allow-list
// would silently miss new files in unlisted locations.
const collectCoverageFrom = [
  'src/**/*.{ts,tsx}',
  // The only exclusions are files that physically cannot be loaded as modules under the
  // jest runtime — Web/Shared Worker entry scripts (worker-global scope: `onconnect`,
  // `self`, no module exports) and the render-worker factory (`new Worker(new URL(...,
  // import.meta.url))`, which `import.meta` makes unloadable under the commonjs transform;
  // it exists precisely so consumers MOCK it). Everything else is unit-tested.
  '!src/**/*.worker.ts',
  '!src/lib/create-render-worker.ts',
];

const config = {
  collectCoverageFrom,
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/tests/**/*.test.ts'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
      // Also loaded for node-project tests so the editor `.test.ts` files that opt
      // into jsdom via a `/* @jest-environment jsdom */` pragma still get jest-dom
      // matchers + the matchMedia polyfill (harmless in a pure-node test).
      setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
      collectCoverageFrom,
      coveragePathIgnorePatterns,
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/**/*.test.tsx'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
      collectCoverageFrom,
      coveragePathIgnorePatterns,
    },
  ],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};

module.exports = config;
