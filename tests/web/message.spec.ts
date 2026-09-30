import { test, expect } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { ChannelPage } from '../../web/pages/ChannelPage';
import { env } from '../../src/config/env';

test.describe('Send Message', () => {

    test('send message in channel', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(env.adminUsername, env.adminPassword);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/town-square`));

        const channelPage = new ChannelPage(page);
        const message = `Hello from Playwright ${Date.now()}`;

        await channelPage.postMessageText(message);
        await expect(channelPage.postWithText(message)).toBeVisible();
    });

});

