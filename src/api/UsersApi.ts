import type { APIResponse } from '@playwright/test';
import type { ApiClient } from './ApiClient';

export class UsersApi {
    constructor(private readonly client: ApiClient) {}

    async login(username: string, password: string): Promise<APIResponse> {
        const response = await this.client.post('/users/login', { login_id: username, password });
        // The token is in the response header, not in the body
        if (response.ok()) this.client.setToken(response.headers()['token']);
        return response;
    }

    async getMe(): Promise<APIResponse> {
        return this.client.get('/users/me');
    }
}
