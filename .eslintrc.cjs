module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jsdoc/recommended-typescript',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',

    // JSDoc: require JSDoc on all public APIs
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

    // JSDoc: param/returns/throws formatting
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

    // JSDoc: opt-out of type annotations (redundant with TypeScript)
    'jsdoc/require-param-type': 'off',
    'jsdoc/require-returns-type': 'off',
    'jsdoc/require-throws-type': 'off',
    'jsdoc/no-types': 'error',
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
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.js', 'specs/'],
  overrides: [
    {
      files: ['**/*.test.ts', '**/tests/helpers/*.ts'],
      rules: {
        '@typescript-eslint/consistent-type-assertions': 'off',
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-description-complete-sentence': 'off',
        'jsdoc/informative-docs': 'off',
        'jsdoc/require-throws': 'off',
      },
    },
  ],
};
