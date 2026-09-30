import { test, expect } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { ChannelPage } from '../../web/pages/ChannelPage';
import { env } from '../../src/config/env';

test.describe('Send Message', () => {
    test('sends a message in a channel', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(env.adminUsername, env.adminPassword);
        await expect(page).toHaveURL(/\/channels\//);

        const channelPage = new ChannelPage(page);
        const message = `Hello from Playwright ${Date.now()}`;

        await channelPage.goto(env.team, 'town-square');
        await channelPage.sendMessage(message);
        await expect(channelPage.postWithText(message)).toBeVisible();
    });
});
