import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import type { ApiError, Channel, Post } from '../../src/api/types';

test.describe('Posts via API', () => {
    let channelId: string;

    test.beforeAll(async ({ api }) => {
        const response = await api.channels.getByName(env.team, 'town-square');
        expect(response.status()).toBe(200);
        channelId = ((await response.json()) as Channel).id;
    });

    test('creates a post and reads it back', async ({ api, createPost }) => {
        const message = `Hello from Playwright API ${Date.now()}`;
        const post = await createPost(message, channelId);
        const postId = post.id;
        const getResponse = await api.posts.get(postId);
        expect(getResponse.status()).toBe(200);
        const fetchedPost = (await getResponse.json()) as Post;
        expect(fetchedPost.id).toBe(postId);
        expect(fetchedPost.message).toBe(message);
        expect(fetchedPost.channel_id).toBe(channelId);
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
