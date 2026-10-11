import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import type { Channel } from '../../src/api/types';

test.describe('Post created via API', () => {
    let channelId: string;

    test.beforeAll(async ({ api }) => {
        const response = await api.channels.getByName(env.team, 'town-square');
        expect(response.status()).toBe(200);
        channelId = ((await response.json()) as Channel).id;
    });

    // Data comes from the API, so this test only checks what the UI shows
    test('shows a post created via API in the channel', async ({ page, channelPage, createPost }) => {
        const message = `Hello from Playwright cross-layer ${Date.now()}`;
        await createPost(message, channelId);

        await channelPage.goto(env.team, 'town-square');
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/town-square`));
        await expect(channelPage.postWithText(message)).toBeVisible();
    });
});
