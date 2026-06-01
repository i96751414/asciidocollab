const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const jsdoc = require('eslint-plugin-jsdoc');
const unicorn = require('eslint-plugin-unicorn').default;
const nextPlugin = require('@next/eslint-plugin-next');
const globals = require('globals');

module.exports = tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**', '**/coverage/**', '**/*.js', '**/*.cjs', '**/*.d.ts', '**/specs/**', '**/.next/**', '**/next-env.d.ts', '**/prisma.config.ts', '**/scripts/**'] },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  jsdoc.configs['flat/recommended-typescript'],

  unicorn.configs['flat/recommended'],

  {
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './packages/domain/tsconfig.eslint.json',
          './packages/shared/tsconfig.eslint.json',
          './packages/db/tsconfig.json',
          './packages/infrastructure/tsconfig.eslint.json',
          './packages/testing/tsconfig.json',
          './apps/api/tsconfig.eslint.json',
          './apps/web/tsconfig.eslint.json',
        ],
        tsconfigRootDir: __dirname,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-deprecated': 'error',
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
      'jsdoc/sort-tags': ['error', {
        tagSequence: [
          { tags: ['param', 'returns', 'throws'] },
        ],
      }],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/require-description': 'error',
      'jsdoc/require-description-complete-sentence': 'error',
      'jsdoc/no-blank-blocks': 'error',
      'jsdoc/informative-docs': 'error',
      'jsdoc/check-tag-names': ['error', { definedTags: ['invariant'] }],
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
    files: ['**/*.tsx'],
    rules: {
      'unicorn/prevent-abbreviations': ['error', {
        checkProperties: false,
        allowList: {
          props: true,
          ref: true,
        },
      }],
    },
  },

  {
    files: ['**/components/ui/**'],
    rules: {
      'unicorn/filename-case': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/tests/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description-complete-sentence': 'off',
      'jsdoc/informative-docs': 'off',
      'jsdoc/require-throws': 'off',
      'jsdoc/no-blank-blocks': 'off',
      'jsdoc/require-description': 'off',
    },
  },
);
