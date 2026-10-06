import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import type { ApiError, Channel, Post } from '../../src/api/types';

test.describe('Posts via API', () => {
    let channelId: string;
    const createdPostIds: string[] = [];

    test.beforeAll(async ({ api }) => {
        const response = await api.channels.getByName(env.team, 'town-square');
        expect(response.status()).toBe(200);
        channelId = ((await response.json()) as Channel).id;
    });

    test.afterAll(async ({ api }) => {
        for (const id of createdPostIds) {
            await api.posts.delete(id);
        }
    });

    test('creates a post and reads it back', async ({ api }) => {
        const message = `Hello from Playwright API ${Date.now()}`;
        const createResponse = await api.posts.create({
            channel_id: channelId,
            message,
        });
        expect(createResponse.status()).toBe(201);
        const postId = ((await createResponse.json()) as Post).id;
        createdPostIds.push(postId);

        const getResponse = await api.posts.get(postId);
        expect(getResponse.status()).toBe(200);
        const post = (await getResponse.json()) as Post;
        expect(post.id).toBe(postId);
        expect(post.message).toBe(message);
        expect(post.channel_id).toBe(channelId);
    });

    test('should return 403 for non-existent channel', async ({ api }) => {
        const response = await api.posts.create({
            channel_id: 'non-existent-channel-id',
            message: 'Permission denied test',
        });
        expect(response.status()).toBe(403);
        const error = (await response.json()) as ApiError;
        expect(error.id).toBe('api.context.permissions.app_error');
    });
});
