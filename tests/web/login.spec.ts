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

    test('shows an error with a wrong password', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(env.adminUsername, 'wrong-password');
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });

    test('shows an error with a wrong username', async ({page}) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('wrong-username', env.adminPassword);
        await expect(loginPage.errorMessageEmptyUsername).toBeVisible();
        await expect(page).toHaveURL(/\/login/);    
    });

    test('shows an error when both username and password are empty', async ({page}) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('', '');
        await expect(loginPage.errorMessageEmpty).toBeVisible();
        await expect(page).toHaveURL(/\/login/);    
    });
});
