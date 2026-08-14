// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes
import { BasePage } from './BasePage';
import { expect } from '@playwright/test';


export class KitchenPage extends BasePage {
  readonly path = '/kitchen';

  // ── Locators ──────────────────────────────────────────────────────────
  // locator-helper: testid
  private inputAInput = this.page.getByTestId('input-a');
  // locator-helper: role_name
  private primaryButton = this.page.getByRole('button', { name: 'Primary', exact: true });
  // locator-helper: testid
  private checkAInput = this.page.getByTestId('check-a');
  // locator-helper: testid
  private selectASelect = this.page.getByTestId('select-a');
  // locator-helper: testid
  private uploadAInput = this.page.getByTestId('upload-a');
  // locator-helper: role_name
  private mainCardDiv = this.page.getByRole('region', { name: 'Main card', exact: true });
  // locator-helper: testid
  private bannerCloseButton = this.page.getByTestId('banner-close');
  // locator-helper: testid
  private rangeAInput = this.page.getByTestId('range-a');
  // locator-helper: testid
  private dragSourceDiv = this.page.getByTestId('drag-source');
  // locator-helper: testid
  private dragTargetDiv = this.page.getByTestId('drag-target');

  // ── Steps ──────────────────────────────────────────────────────────────
  /**
   * Exercise all supported actions
   * @returns this for chaining
   */
  async step_allActions(): Promise<this> {
    await this.page.goto(this.path);
    await this.clickIfVisible(this.bannerCloseButton);
    await this.waitForPageLoad();
    await this.page.waitForURL("/kitchen", { timeout: 15000 });
    await this.page.waitForResponse(r => r.url().includes('/api/kitchen'));
    await this.inputAInput.fill("hello");
    await this.rangeAInput.fill("75");
    await this.primaryButton.click();
    await this.mainCardDiv.hover();
    await this.checkAInput.check();
    await this.checkAInput.uncheck();
    await this.selectASelect.selectOption("one");
    await this.page.keyboard.press('Enter');
    await this.uploadAInput.setInputFiles(['support/data/kitchen/sample.pdf']);
    await this.primaryButton.dblclick();
    await this.dragTo(this.dragSourceDiv, this.dragTargetDiv);
    await this.dragTo(this.dragSourceDiv, this.dragTargetDiv, { native: true });
    await this.mainCardDiv.scrollIntoViewIfNeeded();
    this.page.on('dialog', d => d.accept());
    this.page.on('dialog', d => d.dismiss());
    return this;
  }

  // ── Verifies ───────────────────────────────────────────────────────────
  /**
   * Flow finished
   * @returns this for chaining
   */
  async verify_done(): Promise<this> {
    await expect(this.primaryButton).toBeVisible();
    return this;
  }
}
