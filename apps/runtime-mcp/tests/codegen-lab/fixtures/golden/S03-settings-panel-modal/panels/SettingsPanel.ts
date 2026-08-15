// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePanel } from "./BasePanel";
import { expect } from "@playwright/test";

export class SettingsPanel extends BasePanel {
  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: role_name
  private saveSettingsButton = this.page.getByRole("button", {
    name: "Save settings",
    exact: true
  });
  // locator-helper: text
  private settingsHeading = this.page.getByText("Settings", { exact: true });

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Save panel changes
   * @returns this for chaining
   */
  async step_save(): Promise<this> {
    await this.saveSettingsButton.click();
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Panel should be visible
   * @returns this for chaining
   */
  async verify_panelVisible(): Promise<this> {
    await expect(this.saveSettingsButton).toBeVisible();
    return this;
  }
}
