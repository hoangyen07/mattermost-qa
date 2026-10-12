import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import type { Channel, Post, User } from '../../src/api/types';

test.describe('Posts via DB', () => {
    let channelId: string;

    test.beforeAll(async ({ api }) => {
        const response = await api.channels.getByName(env.team, 'town-square');
        expect(response.status()).toBe(200);
        channelId = ((await response.json()) as Channel).id;
    });

    test('stores a post created via API', async ({ api, db, createPost }) => {
        const message = `Hello from Playwright DB ${Date.now()}`;
        const post = await createPost(message, channelId);

        const row = await db.getPost(post.id);
        expect(row).toBeDefined();
        expect(row?.message).toBe(message);
        expect(row?.channelid).toBe(channelId);

        const response = await api.users.getMe();
        expect(response.status()).toBe(200);
        const user = (await response.json()) as User;
        // TODO: userid equals the admin's id (from api.users.getMe())
        expect(row?.userid).toBe(user.id);
        // TODO: deleteat is '0' (not deleted)
        expect(row?.deleteat).toBe('0');
    });

    test('keeps a deleted post as a soft-deleted row', async ({ api, db }) => {
        // create with api.posts.create (not createPost): this test deletes the post itself
        // delete it with api.posts.delete
        // DB: the row still exists, deleteat > 0
        const message = `Hello from Playwright DB ${Date.now()}`;
        const createResponse = await api.posts.create({ channel_id: channelId, message });
        expect(createResponse.status()).toBe(201);
        const post = (await createResponse.json()) as Post;

        const deleteResponse = await api.posts.delete(post.id);
        expect(deleteResponse.status()).toBe(200);

        const row = await db.getPost(post.id);
        expect(row).toBeDefined();
        expect(row?.message).toBe(message);
        expect(row?.channelid).toBe(channelId);
        expect(row?.deleteat).not.toBe('0');
    });
});
