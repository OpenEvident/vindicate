import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { hasAppUiSource } from "../../src/source-scan/app-source-detect.js";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vindicate-app-source-"));
  roots.push(root);
  return root;
}

async function writeVindicateHarness(root: string): Promise<void> {
  await mkdir(path.join(root, "tests"), { recursive: true });
  await mkdir(path.join(root, "pages"), { recursive: true });
  await mkdir(path.join(root, "support", "config"), { recursive: true });
  await mkdir(path.join(root, "support", "data", "auth"), { recursive: true });
  await writeFile(path.join(root, "playwright.config.ts"), "export default {};\n", "utf8");
  await writeFile(path.join(root, "pages", "BasePage.ts"), "export class BasePage {}\n", "utf8");
  await writeFile(
    path.join(root, "support", "config", "page.config.ts"),
    "export const pages = {};\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "tests", "auth.spec.ts"),
    "import { test } from '@playwright/test';\n",
    "utf8"
  );
}

describe("hasAppUiSource", () => {
  it("returns false for Playwright-only Vindicate scaffold", async () => {
    const root = await makeRoot();
    await writeVindicateHarness(root);
    expect(await hasAppUiSource(root)).toBe(false);
  });

  it("returns true when product UI exists under app/", async () => {
    const root = await makeRoot();
    await writeVindicateHarness(root);
    await mkdir(path.join(root, "app", "login"), { recursive: true });
    await writeFile(
      path.join(root, "app", "login", "page.tsx"),
      "export default function LoginPage() { return null; }\n",
      "utf8"
    );
    expect(await hasAppUiSource(root)).toBe(true);
  });

  it("returns true when product UI exists under src/ outside harness dirs", async () => {
    const root = await makeRoot();
    await writeVindicateHarness(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "Login.tsx"),
      "export function Login() { return <form />; }\n",
      "utf8"
    );
    expect(await hasAppUiSource(root)).toBe(true);
  });

  it("returns true for components/ at project root", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "components"), { recursive: true });
    await writeFile(
      path.join(root, "components", "Button.tsx"),
      "export function Button() { return null; }\n",
      "utf8"
    );
    expect(await hasAppUiSource(root)).toBe(true);
  });
});
