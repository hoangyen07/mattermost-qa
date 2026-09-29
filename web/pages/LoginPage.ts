import type { Locator, Page } from '@playwright/test';

export class LoginPage {
    readonly usernameInput: Locator;
    readonly passwordInput: Locator;
    readonly loginButton: Locator;
    readonly errorMessage: Locator;
    readonly errorMessageEmpty: Locator;
    readonly errorMessageEmptyUsername: Locator;
    readonly errorMessageEmptyPassword: Locator;




    constructor(private readonly page: Page) {
        this.usernameInput = page.getByRole('textbox', { name: 'Email or Username' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password', exact: true });
        this.loginButton = page.getByRole('button', { name: 'Log in' });
        this.errorMessage = page.getByText('The email/username or password is invalid.');
        this.errorMessageEmpty = page.getByText('Please enter your email or username');
        this.errorMessageEmptyUsername = page.getByText('The email/username or password is invalid.');
        this.errorMessageEmptyPassword = page.getByText('Please enter your password');

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
}
