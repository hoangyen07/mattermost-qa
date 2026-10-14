import type { APIResponse } from '@playwright/test';
import type { ApiClient } from './ApiClient';
import type { NewChannel } from './types';

export class ChannelsApi {
    constructor(private readonly client: ApiClient) {}

    async getByName(teamName: string, channelName: string): Promise<APIResponse> {
        return this.client.get(`/teams/name/${teamName}/channels/name/${channelName}`);
    }

    async create(channel: NewChannel): Promise<APIResponse> {
        return this.client.post('/channels', channel);
    }

    // Archives the channel: the row stays in the DB and the name cannot be reused
    async delete(channelId: string): Promise<APIResponse> {
        return this.client.delete(`/channels/${channelId}`);
    }
}
