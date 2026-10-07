import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';
import { ADMIN_STORAGE_STATE } from './src/config/auth';

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
        { name: 'setup', testDir: './tests/setup', testMatch: /.*\.setup\.ts/ },
        {
            name: 'web',
            testDir: './tests/web',
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        },
        { name: 'api', testDir: './tests/api' },
    ],
});
