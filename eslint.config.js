import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      '**/*.test.ts',
      'test/**',
      'tools/**',
      'e2e/**',
      'eslint.config.js',
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
    ],
    ...tseslint.configs.disableTypeChecked,
  },
);
