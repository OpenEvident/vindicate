// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from "./BasePage";
import { expect } from "@playwright/test";

export class CheckoutPage extends BasePage {
  readonly path = "/checkout";

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: role_name
  private placeOrderButton = this.page.getByRole("button", { name: "Place order", exact: true });

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Open checkout
   * @returns this for chaining
   */
  async step_navigate(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }

  /**
   * Submit order
   * @returns this for chaining
   */
  async step_placeOrder(): Promise<this> {
    await this.placeOrderButton.click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Checkout ready
   * @returns this for chaining
   */
  async verify_checkoutReady(): Promise<this> {
    await expect(this.placeOrderButton).toBeVisible();
    return this;
  }
}
