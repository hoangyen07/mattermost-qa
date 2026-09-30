import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';

test.describe('Send Message', () => {
    test('sends a message in a channel', async ({ page, loginPage, channelPage }) => {

        await loginPage.goto();
        await loginPage.login(env.adminUsername, env.adminPassword);
        await expect(page).toHaveURL(/\/channels\//);

        const message = `Hello from Playwright ${Date.now()}`;

        await channelPage.goto(env.team, 'town-square');
        await channelPage.sendMessage(message);
        await expect(channelPage.postWithText(message)).toBeVisible();
    });
});
