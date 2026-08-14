import { APIRequestContext } from '@playwright/test';

/**
 * Shared base for every resource client — holds the Playwright request context every client
 * method forwards calls through. Every method also accepts an optional `headers` argument that
 * overrides the context's defaults for that one call only (Playwright merges per-call headers
 * over extraHTTPHeaders, it doesn't replace them).
 */
export abstract class BaseApiClient {
  constructor(protected readonly request: APIRequestContext) {}
}
