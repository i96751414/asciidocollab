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

const config = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/tests/**/*.test.ts'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/**/*.test.tsx'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
    },
  ],
  // Branch coverage is lower (~80%) because several files need a live CodeMirror
  // EditorView or complex DOM interactions to exercise all conditional paths.
  // The other three metrics enforce a strict 90% floor.
  coverageThreshold: {
    global: {
      lines: 93,
      statements: 90,
      functions: 90,
      branches: 80,
    },
  },
};

module.exports = config;
