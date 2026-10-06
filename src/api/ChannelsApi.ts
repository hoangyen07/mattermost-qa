import type { APIResponse } from '@playwright/test';
import type { ApiClient } from './ApiClient';

export class ChannelsApi {
    constructor(private readonly apiClient: ApiClient) {}

    async getByName(teamName: string, channelName: string): Promise<APIResponse> {
        return this.apiClient.get(`/teams/name/${teamName}/channels/name/${channelName}`);
    }
}
