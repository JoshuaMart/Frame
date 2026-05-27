// Flat ESLint config — covers the WebExtension code (browser + module syntax),
// the background event page (browser globals only), and the content script.

import globals from 'globals';

const baseRules = {
  'no-unused-vars': ['warn', {
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
    ignores: [
      'lib/**',
      'web-ext-artifacts/**',
      'node_modules/**',
      '.git/**',
    ],
  },
  {
    // Editor / popup (ES module pages)
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
    // Background event page (classic script, loaded via manifest "scripts")
    // — top-level declarations are intentionally global here.
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
    // Content scripts (run in page context, no extension APIs)
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
