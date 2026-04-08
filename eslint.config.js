import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
