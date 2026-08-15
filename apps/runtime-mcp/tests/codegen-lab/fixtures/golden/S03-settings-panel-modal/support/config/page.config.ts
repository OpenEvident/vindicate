import { test as base, expect } from "@playwright/test";

import { SettingsPanel } from "./page-loader";
// grow_tests appends one import line per new page class above this comment.
// Imports come from './page-loader' (the barrel) — not direct page class paths.
// example: import { LoginPage } from './page-loader';

const test = base.extend<{
  // fixture-types: grow_tests appends one type entry per feature below this line
  settingsPanel: SettingsPanel;
  // example: loginPage fixture → LoginPage class
}>({
  // fixture-impls: grow_tests appends one fixture entry per feature below this line
  settingsPanel: async ({ page }, use) => {
    await use(new SettingsPanel(page));
  }
  // example: loginPage async fixture wrapping new LoginPage(page)
});

export { test, expect };
