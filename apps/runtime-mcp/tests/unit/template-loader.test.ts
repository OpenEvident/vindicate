import { describe, expect, it } from "vitest";

import { loadScaffoldTemplates } from "../../src/scaffold/template-loader.js";

describe("loadScaffoldTemplates", () => {
  it("defaults to 'both' — shared, ui, and api content all present", async () => {
    const templates = await loadScaffoldTemplates();
    expect(templates["package.json"]).toBeDefined(); // shared
    expect(templates["pages/BasePage.ts"]).toBeDefined(); // ui
    expect(templates["clients/BaseApiClient.ts"]).toBeDefined(); // api
  });

  it("target 'ui' includes shared + ui, excludes api-only files", async () => {
    const templates = await loadScaffoldTemplates("ui");
    expect(templates["package.json"]).toBeDefined();
    expect(templates["pages/BasePage.ts"]).toBeDefined();
    expect(templates["support/config/page.config.ts"]).toBeDefined();
    expect(templates["clients/BaseApiClient.ts"]).toBeUndefined();
    expect(templates["support/config/api.config.ts"]).toBeUndefined();
    expect(templates["tests/api-smoke.spec.ts"]).toBeUndefined();
  });

  it("target 'api' includes shared + api, excludes ui-only files", async () => {
    const templates = await loadScaffoldTemplates("api");
    expect(templates["package.json"]).toBeDefined();
    expect(templates["clients/BaseApiClient.ts"]).toBeDefined();
    expect(templates["support/config/api.config.ts"]).toBeDefined();
    expect(templates["tests/api-smoke.spec.ts"]).toBeDefined();
    expect(templates["pages/BasePage.ts"]).toBeUndefined();
    expect(templates["panels/BasePanel.ts"]).toBeUndefined();
    expect(templates["tests/smoke.spec.ts"]).toBeUndefined();
  });

  it("merges README.md (concatenates) instead of one subtree silently clobbering the other in 'both' mode", async () => {
    const both = await loadScaffoldTemplates("both");
    const uiOnly = await loadScaffoldTemplates("ui");
    const apiOnly = await loadScaffoldTemplates("api");

    // Each single-target README is present in its own load...
    expect(uiOnly["README.md"]).toContain("pages/");
    expect(apiOnly["README.md"]).toContain("clients/");
    // ...and 'both' keeps content recognizable from *each* source, not just one of them.
    expect(both["README.md"]).toContain("pages/");
    expect(both["README.md"]).toContain("clients/");
  });

  it("never produces an empty template set for any target", async () => {
    for (const target of ["ui", "api", "both"] as const) {
      const templates = await loadScaffoldTemplates(target);
      expect(Object.keys(templates).length).toBeGreaterThan(0);
    }
  });
});
