import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'test-output',
      'e2e',
      '.remember',
      'vitest.config.*.timestamp*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-console': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
    plugins: { 'simple-import-sort': simpleImportSort },
  },
  eslintPluginPrettierRecommended,
);
