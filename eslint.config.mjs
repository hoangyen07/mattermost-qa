// @ts-check
import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default defineConfig(
    {
        ignores: ['node_modules/', 'playwright-report/', 'test-results/'],
    },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                // This file is not in tsconfig "include", so let ESLint type-check it on its own
                projectService: { allowDefaultProject: ['eslint.config.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Playwright rules only for test files, not for page objects
        files: ['tests/**/*.ts'],
        extends: [playwright.configs['flat/recommended']],
    },
);
