import type { APIRequestContext, APIResponse } from '@playwright/test';

const API_PREFIX = '/api/v4';

export class ApiClient {
    private token?: string;

    constructor(private readonly request: APIRequestContext) {}

    setToken(token: string | undefined): void {
        this.token = token;
    }

    async get(path: string): Promise<APIResponse> {
        return this.request.get(API_PREFIX + path, { headers: this.authHeaders() });
    }

    async post(path: string, data?: unknown): Promise<APIResponse> {
        return this.request.post(API_PREFIX + path, { data, headers: this.authHeaders() });
    }

    async delete(path: string): Promise<APIResponse> {
        return this.request.delete(API_PREFIX + path, { headers: this.authHeaders() });
    }

    private authHeaders(): Record<string, string> {
        return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }
}
