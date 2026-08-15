import { test as base, expect } from "@playwright/test";

import { LoginPage } from "./page-loader";
// grow_tests appends one import line per new page class above this comment.

const test = base.extend<{
  // fixture-types: grow_tests appends one type entry per feature below this line
  loginPage: LoginPage;
}>({
  // fixture-impls: grow_tests appends one fixture entry per feature below this line
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  }
});

export { test, expect };
