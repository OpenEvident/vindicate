// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from "./BasePage";
import { expect, Locator } from "@playwright/test";

export class ProductsPage extends BasePage {
  readonly path = "/products";

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: testid
  private promoCloseButton = this.page.getByTestId("promo-close");
  // locator-helper: dyn_param
  private deleteProductButton(id: string): Locator {
    return this.page.getByTestId(`delete-product-${id}`);
  }
  // locator-helper: dyn_param
  private rowStatusSpan(id: string): Locator {
    return this.page.getByTestId(`row-status-${id}`);
  }

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Open the products page.
   * @returns this for chaining
   */
  async step_open(): Promise<this> {
    await this.page.goto(this.path);
    await this.waitForPageLoad();
    return this;
  }

  /**
   * Dismiss the promo banner if it appears.
   * @returns this for chaining
   */
  async step_dismiss_promo(): Promise<this> {
    await this.clickIfVisible(this.promoCloseButton, 3000);
    return this;
  }

  /**
   * Delete the product row with the given id.
   * @param id - Id (string)
   * @returns this for chaining
   */
  async step_delete_product(id: string): Promise<this> {
    await this.deleteProductButton(id).click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Verify the product row for the given id is gone.
   * @param id - Id (string)
   * @returns this for chaining
   */
  async verify_row_removed(id: string): Promise<this> {
    await this.rowStatusSpan(id).waitFor({ state: "hidden" });
    await expect(this.rowStatusSpan(id)).toBeHidden();
    return this;
  }
}
