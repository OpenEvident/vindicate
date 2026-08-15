// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from "./BasePage";
import { expect } from "@playwright/test";

export class CartPage extends BasePage {
  readonly path = "/cart";

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: role_name
  private checkoutButton = this.page.getByRole("button", { name: "Checkout", exact: true });

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Open cart
   * @returns this for chaining
   */
  async step_navigate(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }

  /**
   * Go to checkout
   * @returns this for chaining
   */
  async step_checkout(): Promise<this> {
    await this.checkoutButton.click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Cart ready
   * @returns this for chaining
   */
  async verify_cartReady(): Promise<this> {
    await expect(this.checkoutButton).toBeVisible();
    return this;
  }
}
