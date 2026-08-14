import { test as base, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

// grow_tests appends one import line per new resource client above this comment.
// Imports come from './client-loader' (the barrel) — not direct client class paths.
// example: import { PostClient } from './client-loader';

const test = base.extend<{
  // Independent request context for the API — its own base URL, decoupled from the UI's
  // baseURL (playwright.config.ts's `use.baseURL`) so a project with both UI and API tests never
  // has the two fight over the same setting. Defaults to BASE_URL when API_BASE_URL isn't set, so
  // an API-only project only ever needs to configure one URL.
  apiRequest: APIRequestContext;

  // fixture-types: grow_tests appends one type entry per feature below this line
  // example: postApi fixture → PostClient class
}>({
  apiRequest: async ({}, use) => {
    const context = await playwrightRequest.newContext({
      baseURL: process.env.API_BASE_URL || process.env.BASE_URL || '{{BASE_URL}}',
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    await use(context);
    await context.dispose();
  },

  // fixture-impls: grow_tests appends one fixture entry per feature below this line
  // example: postApi async fixture wrapping new PostClient(apiRequest)
});

export { test, expect };
