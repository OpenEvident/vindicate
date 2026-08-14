import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectProjectTestFiles } from "../../../src/extension/filesystem/projectTestFiles.js";

describe("collectProjectTestFiles", () => {
  const root = path.join(process.cwd(), "tests", "tmp-project-tests");

  beforeEach(async () => {
    await mkdir(path.join(root, "tests", "checkout"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds flat specs under tests/", async () => {
    await writeFile(path.join(root, "tests", "smoke.spec.ts"), "", "utf8");
    const files = await collectProjectTestFiles(root);
    expect(files.map((f) => path.basename(f))).toEqual(["smoke.spec.ts"]);
  });

  it("finds nested specs under tests/<section>/", async () => {
    await writeFile(path.join(root, "tests", "checkout", "cart.spec.ts"), "", "utf8");
    const files = await collectProjectTestFiles(root);
    expect(files.map((f) => f.replace(/\\/g, "/"))).toEqual([
      `${root.replace(/\\/g, "/")}/tests/checkout/cart.spec.ts`
    ]);
  });

  it("ignores spec files outside tests/", async () => {
    await mkdir(path.join(root, "pages"), { recursive: true });
    await writeFile(path.join(root, "pages", "LoginPage.spec.ts"), "", "utf8");
    const files = await collectProjectTestFiles(root);
    expect(files).toEqual([]);
  });
});
