import { test, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import { buildMessage } from '../../src/data/factory';

// Each test sends its message into its own channel (created via API, archived afterwards),
// so tests never share data and town-square stays clean
test.describe('Send Message', () => {
    test('sends a message in a channel', async ({ page, channelPage, testChannel }) => {
        const message = buildMessage();

        await channelPage.goto(env.team, testChannel.name);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/${testChannel.name}`));
        await channelPage.sendMessage(message);
        await expect(channelPage.postWithText(message)).toBeVisible();
    });

    test('sends a message after switching channel from the sidebar', async ({ page, channelPage, testChannel }) => {
        const message = buildMessage();

        // The channel was created via API: it must also show up in the sidebar
        await channelPage.goto(env.team, 'town-square');
        await channelPage.sidebar.openChannel(testChannel.display_name);
        await expect(page).toHaveURL(new RegExp(`/${env.team}/channels/${testChannel.name}`));

        await channelPage.sendMessage(message);
        await expect(channelPage.postWithText(message)).toBeVisible();
    });
});
