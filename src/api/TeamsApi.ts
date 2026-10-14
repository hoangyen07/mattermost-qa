import type { APIResponse } from '@playwright/test';
import type { ApiClient } from './ApiClient';

export class TeamsApi {
    constructor(private readonly client: ApiClient) {}

    async getByName(teamName: string): Promise<APIResponse> {
        return this.client.get(`/teams/name/${teamName}`);
    }
}
