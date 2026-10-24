// @ts-check
import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'playwright-report',
      'test-results',
      'compliance-report',
      'coverage',
      '.keys',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'bin/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['tests/conformance/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Conditional skips (e.g. mock-only policy checks) are intentional; unconditional ones are not.
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      // Assertions live in the custom SNAP matcher and in SnapClient helpers.
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectSnapSuccess', 'expectTransactionNotFound'] },
      ],
    },
  },
);
