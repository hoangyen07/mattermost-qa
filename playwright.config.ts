import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: env.baseUrl,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'web', testDir: './tests/web', use: { ...devices['Desktop Chrome'] } },
        { name: 'api', testDir: './tests/api' },
    ],
});
