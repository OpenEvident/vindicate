// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from './BasePage';
import { expect } from '@playwright/test';


export class LoginPage extends BasePage {
  readonly path = '/login';

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: testid
  private emailInput = this.page.getByTestId('email');
  // locator-helper: role_name
  private continueButton = this.page.getByRole('button', { name: 'Continue', exact: true });

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Open login
   * @returns this for chaining
   */
  async step_navigate(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }

  /**
   * Continue to cart
   * @returns this for chaining
   */
  async step_continue(): Promise<this> {
    await this.continueButton.click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Loaded login
   * @returns this for chaining
   */
  async verify_loaded(): Promise<this> {
    await expect(this.emailInput).toBeVisible();
    return this;
  }
}
