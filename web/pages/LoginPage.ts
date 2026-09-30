import type { Locator, Page } from '@playwright/test';

export class LoginPage {
    readonly usernameInput: Locator;
    readonly passwordInput: Locator;
    readonly loginButton: Locator;

    constructor(private readonly page: Page) {
        this.usernameInput = page.getByRole('textbox', { name: 'Email or Username' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password', exact: true });
        this.loginButton = page.getByRole('button', { name: 'Log in' });
    }

    async goto() {
        // Skip the "view in desktop app or browser" landing page
        await this.page.addInitScript(() => localStorage.setItem('__landingPageSeen__', 'true'));
        await this.page.goto('/login');
    }

    async login(username: string, password: string) {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }

    errorMessage(text: string): Locator {
        return this.page.getByText(text);
    }
}
