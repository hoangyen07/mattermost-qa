import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { ChannelPage } from '../../web/pages/ChannelPage';
import { MattermostApi } from '../api/MattermostApi';
import { env } from '../config/env';
import type { Post } from '../api/types';
import { MattermostDb } from '../db/MattermostDb';

type TestFixtures = {
    loginPage: LoginPage;
    channelPage: ChannelPage;
    createPost: (message: string, channelId: string) => Promise<Post>;
};

type WorkerFixtures = {
    api: MattermostApi;
    db: MattermostDb;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    channelPage: async ({ page }, use) => {
        await use(new ChannelPage(page));
    },
    createPost: async ({ api }, use) => {
        const created: string[] = [];

        await use(async (message, channelId) => {
            const response = await api.posts.create({ channel_id: channelId, message });
            expect(response.status()).toBe(201);
            const post = (await response.json()) as Post;
            created.push(post.id); // recorded right after creating
            return post;
        });

        // Runs after every test that used createPost, even if the test failed
        for (const id of created) await api.posts.delete(id);
    },
    // Authenticated admin client for data setup, logged in once per worker
    api: [
        async ({ playwright }, use) => {
            // Empty storageState: in the web project, new request contexts inherit the browser
            // cookies, and Mattermost rejects a login that carries them without a CSRF header
            const request = await playwright.request.newContext({
                baseURL: env.baseUrl,
                storageState: { cookies: [], origins: [] },
            });
            const api = new MattermostApi(request);
            const response = await api.users.login(env.adminUsername, env.adminPassword);
            if (!response.ok()) {
                throw new Error(`Admin login failed: ${response.status()} ${await response.text()}`);
            }
            await use(api);
            await request.dispose();
        },
        { scope: 'worker' },
    ],
    db: [
        // Playwright requires an object pattern here, even when the fixture needs no other fixtures
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            const db = new MattermostDb(env.db);
            await use(db);
            await db.close(); // without this the worker cannot exit
        },
        { scope: 'worker' },
    ],
});

export { expect } from '@playwright/test';
