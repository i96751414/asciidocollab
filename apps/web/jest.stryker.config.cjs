/** @type {import('jest').Config} */

// Stryker-specific Jest config: single environment (jsdom) to avoid the
// multi-project sandbox issue where .tsx tests end up in node environment.
const sharedTransform = {
  '^.+\\.(ts|tsx)$': ['ts-jest', {
    tsconfig: {
      jsx: 'react-jsx',
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
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

module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  transform: sharedTransform,
  moduleNameMapper: sharedModuleNameMapper,
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
};
