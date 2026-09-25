import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-new-func': 'error',
    },
    languageOptions: {
      globals: Object.fromEntries(
        ['window', 'document', 'navigator', 'FormData', 'fetch', 'URL', 'Blob', 'setTimeout'].map(
          (name) => [name, 'readonly']
        )
      ),
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        structuredClone: 'readonly',
        URL: 'readonly',
      },
    },
  },
  prettier,
];
