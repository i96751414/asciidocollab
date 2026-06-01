/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.eslint.json',
    }],
  },
  // Collect from all source files, excluding barrel re-export indexes.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 70,
      lines: 85,
    },
  },
};

module.exports = config;
