/** @type {import('jest').Config} */

const sharedTransform = {
  '^.+\\.(ts|tsx)$': ['ts-jest', {
    tsconfig: {
      jsx: 'react-jsx',
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
      resolveJsonModule: true,
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

// Enforce coverage over the AsciiDoc-editor surface this app owns (matching the
// monorepo convention where domain/api/shared set `collectCoverageFrom: src/**`).
// Without this, the global threshold below only measures files a test happens to
// import, so a brand-new editor module with no test would silently pass the gate.
// Excluded: files that cannot be loaded under the jest transform or are exercised
// only via the isolated e2e stack —
//   - asciidoc-parser.js: the generated Lezer parser (ESM, not transformed here);
//   - asciidoc-language.ts: imports that generated ESM parser;
//   - asciidoc-block-tokens.ts: the production external tokenizer (its logic is
//     exercised through the hand-synced test mirror + the full e2e suite);
//   - *.worker.ts / create-render-worker.ts: Web Worker entry points (import.meta).
// The broader src/app route tree and legacy non-editor components remain on the
// e2e-covered convention (a separate, app-wide unit-coverage effort, out of scope here).
const collectCoverageFrom = [
  'src/lib/codemirror/**/*.{ts,tsx}',
  'src/lib/asciidoc/**/*.{ts,tsx}',
  'src/lib/api/**/*.{ts,tsx}',
  'src/components/editor/**/*.{ts,tsx}',
  'src/components/file-tree/**/*.{ts,tsx}',
  'src/hooks/**/*.{ts,tsx}',
  '!src/lib/codemirror/asciidoc-parser.js',
  '!src/lib/codemirror/asciidoc-language.ts',
  '!src/lib/codemirror/asciidoc-block-tokens.ts',
  '!src/**/*.worker.ts',
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
