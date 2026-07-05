/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier', // must be last — disables rules that conflict with Prettier
  ],
  rules: {
    // Enforce no unused variables (use TS version, not base ESLint)
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // No floating promises in async code
    '@typescript-eslint/no-floating-promises': 'error',
    // Consistent import ordering
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    '.turbo/',
    'coverage/',
    '**/*.js', // JS files are config files only — each app/package may override
  ],
};
