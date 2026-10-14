import type { APIRequestContext } from '@playwright/test';
import { ApiClient } from './ApiClient';
import { UsersApi } from './UsersApi';
import { PostsApi } from './PostsApi';
import { ChannelsApi } from './ChannelsApi';
import { TeamsApi } from './TeamsApi';

export class MattermostApi {
    readonly users: UsersApi;
    readonly teams: TeamsApi;
    readonly channels: ChannelsApi;
    readonly posts: PostsApi;

    constructor(request: APIRequestContext) {
        // One shared client, so a login via `users` authenticates `posts` too
        const client = new ApiClient(request);
        this.users = new UsersApi(client);
        this.teams = new TeamsApi(client);
        this.channels = new ChannelsApi(client);
        this.posts = new PostsApi(client);
    }
}
