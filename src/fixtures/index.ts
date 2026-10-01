import { test as base } from '@playwright/test';
import { LoginPage } from '../../web/pages/LoginPage';
import { ChannelPage } from '../../web/pages/ChannelPage';

type Pages = {
    loginPage: LoginPage;
    channelPage: ChannelPage;
};

export const test = base.extend<Pages>({
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    channelPage: async ({ page }, use) => {
        await use(new ChannelPage(page));
    }
});

export { expect } from '@playwright/test';