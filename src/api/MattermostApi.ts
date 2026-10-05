import type { APIRequestContext } from '@playwright/test';
import { ApiClient } from './ApiClient';
import { UsersApi } from './UsersApi';

export class MattermostApi {
    readonly users: UsersApi;

    constructor(request: APIRequestContext) {
        // One shared client, so a login via `users` authenticates `posts` too
        const client = new ApiClient(request);
        this.users = new UsersApi(client);
    }
}
