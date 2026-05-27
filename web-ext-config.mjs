// web-ext configuration — controls what gets bundled into the XPI.
export default {
  sourceDir: '.',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'eslint.config.js',
    'web-ext-config.mjs',
    'node_modules',
    '.github',
    '.git',
    '.gitignore',
    '.DS_Store',
    'web-ext-artifacts',
    'README.md',
    'README*.md',
    '*.md',
  ],
};
