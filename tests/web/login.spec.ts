import { test, expect } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { env } from '../../src/config/env';

test.describe('Login', () => {
    test('logs in with valid credentials', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(env.adminUsername, env.adminPassword);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/town-square`));
    });

    const invalidLogins = [
        { title: 'unknown username', username: 'no-such-user', password: 'whatever123', error: 'The email/username or password is invalid.' },
        { title: 'empty username', username: '', password: 'whatever123', error: 'Please enter your email or username' },
        { title: 'empty password', username: 'someone', password: '', error: 'Please enter your password' },
        { title: 'wrong password', username: env.adminUsername, password: 'wrong-password', error: 'The email/username or password is invalid.' },
    ];

    for (const { title, username, password, error } of invalidLogins) {
        test(`shows an error with ${title}`, async ({ page }) => {
            const loginPage = new LoginPage(page);
            await loginPage.goto();
            await loginPage.login(username, password);
            await expect(loginPage.errorMessage(error)).toBeVisible();
            await expect(page).toHaveURL(/\/login/);
        });
    }
});
