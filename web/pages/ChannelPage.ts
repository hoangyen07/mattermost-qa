import { Locator, Page } from '@playwright/test';

export class ChannelPage {

    readonly textboxPostMessage: Locator;
    readonly buttonSend: Locator;
    readonly postMessage: Locator;

    constructor(private readonly page: Page) {
        this.textboxPostMessage = page.getByRole('textbox', { name: 'Write to Town Square' });
        this.buttonSend = page.getByTestId('SendMessageButton');
        this.postMessage = page.getByTestId('post-message-text').last();
    }

    async postMessageText(message: string) {
        await this.textboxPostMessage.fill(message);
        await this.buttonSend.click();
    }

    postWithText(text: string): Locator {
        return this.page.getByTestId('post-message-text').filter({ hasText: text });
    }
}