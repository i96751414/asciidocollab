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

// Enforce coverage over ALL application source (matching the monorepo convention
// where domain/api/shared set `collectCoverageFrom: src/**`). Without this, the
// global threshold below only measures files a test happens to import, so a brand-new
// module with no test would silently pass the gate. This list is EXCLUSION-based
// (`src/**` then `!…`) so any newly-added file is counted by default — an allow-list
// would silently miss new files in unlisted locations.
const collectCoverageFrom = [
  'src/**/*.{ts,tsx}',
  // Next.js App Router route tree — pages/layouts/route-client components are
  // integration surfaces exercised by the Playwright e2e suite, not unit-tested
  // here. The one substantial editor module that lives under app/ is re-included.
  '!src/app/**',
  'src/app/**/project-editor-layout.tsx',
  '!src/proxy.ts',
  // Web Worker entry points (Worker / import.meta — not loadable under ts-jest).
  '!src/**/*.worker.ts',
  '!src/lib/create-render-worker.ts',
  // The generated Lezer parser + the modules that statically import it (ESM the
  // jest transform cannot load). The tokenizer LOGIC is covered separately via
  // `asciidoc-block-token-logic.ts`, which these two only wire up.
  '!src/lib/codemirror/asciidoc-parser.js',
  '!src/lib/codemirror/asciidoc-language.ts',
  '!src/lib/codemirror/asciidoc-block-tokens.ts',
  // Pre-existing app-wide gap: legacy (non-editor) feature components/contexts/helpers
  // that predate this work and have no unit tests yet. TODO: backfill tests and drop
  // these exclusions — they are enumerated (not hidden by an allow-list) so the debt
  // stays visible and a NEW untested module is still caught by the gate.
  '!src/components/{archive-button,delete-project-button,empty-state,error-boundary,invite-member-form,member-list,project-form,project-settings-form,sole-owner-warning,user-search-combobox}.tsx',
  '!src/contexts/current-user-context.tsx',
  '!src/lib/get-project-access.ts',
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
