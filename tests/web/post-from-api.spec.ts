import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import { buildMessage } from '../../src/data/factory';

test.describe('Post created via API', () => {
    // Data comes from the API, so this test only checks what the DB stores and the UI shows
    test('stores and shows a post created via API', async ({ page, channelPage, db, testChannel, createPost }) => {
        const message = buildMessage('Hello from Playwright cross-layer');
        const post = await createPost(message, testChannel.id);

        const row = await db.getPost(post.id);
        expect(row?.message).toBe(message);
        expect(row?.channelid).toBe(testChannel.id);

        await channelPage.goto(env.team, testChannel.name);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/${testChannel.name}`));
        await expect(channelPage.postWithText(message)).toBeVisible();
    });

    // Creating 3 posts through the UI means typing and sending 3 times; via API it is instant
    test('shows posts created via API in the order they were created', async ({
        page,
        channelPage,
        testChannel,
        createPost,
    }) => {
        const base = buildMessage('Ordered post');
        const messages = [`${base} 1`, `${base} 2`, `${base} 3`];
        for (const message of messages) await createPost(message, testChannel.id);

        await channelPage.goto(env.team, testChannel.name);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/${testChannel.name}`));
        // postWithText matches by substring, so `base` finds all 3 posts in on-screen order
        await expect(channelPage.postWithText(base)).toHaveText(messages);
    });
});
