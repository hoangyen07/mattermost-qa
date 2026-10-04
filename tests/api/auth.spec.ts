import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import { MattermostApi } from '../../src/api/MattermostApi';
import type { ApiError, User } from '../../src/api/types';

test.describe('Login via API', () => {
    // Built-in `request` fixture: a fresh, unauthenticated context per test
    test('logs in with valid credentials', async ({ request }) => {
        const response = await new MattermostApi(request).login(env.adminUsername, env.adminPassword);

        expect(response.status()).toBe(200);
        expect(response.headers()['token']).toBeTruthy();
        const user = (await response.json()) as User;
        expect(user.username).toBe(env.adminUsername);
    });

    test('rejects invalid credentials', async ({ request }) => {
        const response = await new MattermostApi(request).login('no-such-user', 'wrong-password');

        expect(response.status()).toBe(401);
        // Assert the error id, not the message: the id is stable, the text is not
        const error = (await response.json()) as ApiError;
        expect(error.id).toBe('api.user.login.invalid_credentials_email_username');
    });

    test('rejects a request without a token', async ({ request }) => {
        const response = await new MattermostApi(request).getMe();

        expect(response.status()).toBe(401);
        const error = (await response.json()) as ApiError;
        expect(error.id).toBe('api.context.session_expired.app_error');
    });

    test('returns the logged-in user', async ({ api }) => {
        const response = await api.getMe();

        expect(response.status()).toBe(200);
        const user = (await response.json()) as User;
        expect(user.username).toBe(env.adminUsername);
    });
});
