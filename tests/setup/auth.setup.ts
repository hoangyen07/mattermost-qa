import { test as setup, expect } from '../../src/fixtures';
import { env } from '../../src/config/env';
import { ADMIN_STORAGE_STATE } from '../../src/config/auth';

setup('log in as admin', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(env.adminUsername, env.adminPassword);
    // Wait until login has finished before saving, or the cookies may not be set yet
    await expect(page).toHaveURL(/\/channels\//);
    await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
