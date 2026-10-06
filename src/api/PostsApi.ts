import type { APIResponse } from '@playwright/test';
import type { ApiClient } from './ApiClient';
import type { NewPost } from './types';

export class PostsApi {
    constructor(private readonly client: ApiClient) {}

    async create(postData: NewPost): Promise<APIResponse> {
        return this.client.post('/posts', postData);
    }

    async get(postId: string): Promise<APIResponse> {
        return this.client.get(`/posts/${postId}`);
    }

    async delete(postId: string): Promise<APIResponse> {
        return this.client.delete(`/posts/${postId}`);
    }
}
