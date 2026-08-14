import { Page, Locator, TestInfo } from '@playwright/test';

export class BasePage {
  protected page: Page;

  constructor(page: Page) { this.page = page; }

  async waitForPageLoad(): Promise<this> {
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  async waitForElement(locator: Locator, timeout = 10000): Promise<this> {
    await locator.waitFor({ state: 'visible', timeout });
    return this;
  }

  async clickIfVisible(locator: Locator, timeout = 2000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
    } catch {
      return false;
    }
    await locator.click();
    return true;
  }

  protected async dragTo(source: Locator, target: Locator, opts?: { native?: boolean }): Promise<void> {
    if (opts?.native === true) {
      await source.dragTo(target);
      return;
    }
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const srcBox = await source.boundingBox();
    const dstBox = await target.boundingBox();
    if (srcBox === null || dstBox === null) {
      throw new Error('dragTo: source or target element is not visible');
    }
    const srcCenter = { x: srcBox.x + srcBox.width / 2, y: srcBox.y + srcBox.height / 2 };
    const dstCenter = { x: dstBox.x + dstBox.width / 2, y: dstBox.y + dstBox.height / 2 };
    await this.page.mouse.move(srcCenter.x, srcCenter.y);
    await this.page.mouse.down();
    await this.page.mouse.move(dstCenter.x, dstCenter.y, { steps: 10 });
    await this.page.mouse.up();
  }

  async getTitle(): Promise<string> { return this.page.title(); }

  async attachScreenshot(testInfo: TestInfo, name = 'screenshot'): Promise<void> {
    const screenshot = await this.page.screenshot({ fullPage: true });
    await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
  }
}
