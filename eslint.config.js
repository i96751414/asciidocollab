const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const jsdoc = require('eslint-plugin-jsdoc');
const unicorn = require('eslint-plugin-unicorn').default;
const globals = require('globals');

module.exports = tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**', '**/coverage/**', '**/*.js', '**/specs/**'] },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,

  jsdoc.configs['flat/recommended-typescript'],

  unicorn.configs['flat/recommended'],

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',

      'unicorn/filename-case': 'error',
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-process-exit': 'off',

      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          ClassDeclaration: true,
          ClassExpression: true,
          MethodDefinition: true,
          FunctionDeclaration: true,
          FunctionExpression: false,
          ArrowFunctionExpression: false,
        },
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'TSMethodSignature',
          'TSPropertySignature',
          'TSEnumDeclaration',
        ],
      }],
      'jsdoc/require-hyphen-before-param-description': ['error', 'always'],
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-throws': 'error',
      'jsdoc/sort-tags': ['warn', {
        tagSequence: [
          { tags: ['param', 'returns', 'throws'] },
        ],
      }],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/require-description-complete-sentence': ['warn'],
      'jsdoc/informative-docs': 'warn',
      'jsdoc/check-tag-names': ['error', { definedTags: ['invariant'] }],
      'jsdoc/check-alignment': 'warn',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-throws-type': 'off',
      'jsdoc/no-types': 'error',
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    settings: {
      jsdoc: {
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'TSMethodSignature',
          'TSPropertySignature',
        ],
        definedTags: ['invariant'],
      },
    },
  },

  {
    files: ['**/*.test.ts', '**/tests/helpers/*.ts', '**/src/routes/*.ts', '**/src/services/session-store.ts', '**/src/config/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description-complete-sentence': 'off',
      'jsdoc/informative-docs': 'off',
      'jsdoc/require-throws': 'off',
    },
  },
);
