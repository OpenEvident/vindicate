// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from './BasePage';
import { expect } from '@playwright/test';


export class LoginPage extends BasePage {
  readonly path = '/login';

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: testid
  private emailInput = this.page.getByTestId('email');
  // locator-helper: testid
  private passwordInput = this.page.getByTestId('password');
  // locator-helper: role_name
  private signInButton = this.page.getByRole('button', { name: 'Sign in', exact: true });

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Open login page
   * @returns this for chaining
   */
  async step_navigate(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }

  /**
   * Fill credentials and submit
   * @param email - Email (string)
   * @param password - Password (string)
   * @returns this for chaining
   */
  async step_signIn(email: string, password: string): Promise<this> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Form is visible
   * @returns this for chaining
   */
  async verify_loginVisible(): Promise<this> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.page).toHaveTitle('Login');
    return this;
  }
}
