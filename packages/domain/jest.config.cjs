/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Resolve the shared leaf package from its source so domain tests don't require a prior build.
  moduleNameMapper: {
    '^@asciidocollab/asciidoc-core$': '<rootDir>/../asciidoc-core/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.eslint.json',
    }],
  },
  // Collect from all source files, excluding barrel re-export indexes.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts'],
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
