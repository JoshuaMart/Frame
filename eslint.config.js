import globals from 'globals';

const baseRules = {
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'none',
  }],
  'no-undef': 'error',
  'no-implicit-globals': 'error',
  'no-var': 'error',
  'prefer-const': 'warn',
  'eqeqeq': ['warn', 'smart'],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

export default [
  {
    files: ['tests/**/*.js', '*.config.js', '*.mjs'],
    languageOptions: { globals: globals.node },
    rules: baseRules,
  },
  {
    ignores: [
      'lib/**',
      'web-ext-artifacts/**',
      'node_modules/**',
      '.git/**',
    ],
  },
  {
    files: ['editor/**/*.js', 'popup/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        Konva: 'readonly',
      },
    },
    rules: baseRules,
  },
  {
    // Manifest background scripts use global declarations.
    files: ['background/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
      },
    },
    rules: { ...baseRules, 'no-implicit-globals': 'off' },
  },
  {
    files: ['content/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: baseRules,
  },
];
