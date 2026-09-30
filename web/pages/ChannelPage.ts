import type { Locator, Page } from '@playwright/test';

export class ChannelPage {
    readonly messageInput: Locator;
    readonly sendButton: Locator;

    constructor(private readonly page: Page) {
        // Test id instead of role: the textbox name ("Write to <channel>") changes per channel
        this.messageInput = page.getByTestId('post_textbox');
        this.sendButton = page.getByTestId('SendMessageButton');
    }

    async goto(team: string, channel: string) {
        await this.page.goto(`/${team}/channels/${channel}`);
    }

    async sendMessage(text: string) {
        await this.messageInput.fill(text);
        await this.sendButton.click();
    }

    postWithText(text: string): Locator {
        return this.page.getByTestId('post-message-text').filter({ hasText: text });
    }
}
