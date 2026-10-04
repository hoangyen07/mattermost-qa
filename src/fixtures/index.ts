import { test as base } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { ChannelPage } from '../../web/pages/ChannelPage';
import { MattermostApi } from '../api/MattermostApi';
import { env } from '../config/env';

type TestFixtures = {
    loginPage: LoginPage;
    channelPage: ChannelPage;
};

type WorkerFixtures = {
    api: MattermostApi;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    channelPage: async ({ page }, use) => {
        await use(new ChannelPage(page));
    },
    // Authenticated admin client for data setup, logged in once per worker
    api: [
        async ({ playwright }, use) => {
            const request = await playwright.request.newContext({ baseURL: env.baseUrl });
            const api = new MattermostApi(request);
            const response = await api.login(env.adminUsername, env.adminPassword);
            if (!response.ok()) {
                throw new Error(`Admin login failed: ${response.status()} ${await response.text()}`);
            }
            await use(api);
            await request.dispose();
        },
        { scope: 'worker' },
    ],
});

export { expect } from '@playwright/test';
