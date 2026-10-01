import type { Locator, Page } from '@playwright/test';

export class Sidebar {
    readonly root: Locator;

    constructor(page: Page) {
        this.root = page.getByRole('application', { name: 'channel sidebar region' });
    }

    channelLink(name: string): Locator {
        // Accessible name is "<name> public channel" / "<name> private channel" (lowercased).
        // Match it exactly so "Town" does not also match "Town Square".
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.root.getByRole('link', { name: new RegExp(`^${escaped} (public|private) channel$`, 'i') });
    }

    async openChannel(name: string) {
        await this.channelLink(name).click();
    }
}
