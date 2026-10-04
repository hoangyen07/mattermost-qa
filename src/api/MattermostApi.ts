import type { APIRequestContext, APIResponse } from '@playwright/test';

export class MattermostApi {
    private token?: string;

    constructor(private readonly request: APIRequestContext) {}

    private authHeaders(): Record<string, string> {
        return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }

    async login(username: string, password: string): Promise<APIResponse> {
        const response = await this.request.post('/api/v4/users/login', {
            data: { login_id: username, password },
        });

        // The token is in the response header, not in the body
        if (response.ok()) this.token = response.headers()['token'];
        return response;
    }
    async getMe(): Promise<APIResponse> {
        return this.request.get('/api/v4/users/me', { headers: this.authHeaders() });
    }
}
