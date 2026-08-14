import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { InvariantId, ScenarioRunResult } from "./scenario-types.js";

// CSS selectors are forbidden in generated locators. Semantic getBy* and XPath are allowed.
const FORBIDDEN_LOCATOR_PATTERNS = [
  /locator\(['"`]\[/, // CSS attribute selector
  /locator\(['"`]\./, // CSS class selector
  /locator\(['"`]#/ // CSS id selector
];

const ACTION_SNIPPETS: Record<string, string> = {
  navigate: "await this.page.goto(this.path);",
  waitForPageLoad: "await this.waitForPageLoad();",
  waitForURL: "await this.page.waitForURL(",
  waitForResponse: "await this.page.waitForResponse(",
  fill: ".fill(",
  click: ".click();",
  click_if_visible: "await this.clickIfVisible(",
  hover: ".hover();",
  check: ".check();",
  uncheck: ".uncheck();",
  select: ".selectOption(",
  press: "this.page.keyboard.press(",
  upload: ".setInputFiles(",
  dblclick: ".dblclick();",
  drag: "await this.dragTo(",
  scroll: ".scrollIntoViewIfNeeded();",
  accept_dialog: "this.page.on('dialog', d => d.accept());",
  dismiss_dialog: "this.page.on('dialog', d => d.dismiss());"
};

async function fileExists(root: string, relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(root: string, relativePath: string): Promise<string | undefined> {
  if (!(await fileExists(root, relativePath))) {
    return undefined;
  }
  return readFile(path.join(root, relativePath), "utf8");
}

async function collectTsFiles(root: string, relativeDir: string): Promise<string[]> {
  const abs = path.join(root, relativeDir);
  try {
    const entries = await readdir(abs, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(relativeDir, entry.name).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

async function assertI1(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels"))
  ];
  for (const file of files) {
    if (file.endsWith("/BasePage.ts") || file.endsWith("/BasePanel.ts")) {
      continue;
    }
    const content = await readFile(path.join(result.root, file), "utf8");
    if (!content.includes("private ")) {
      continue;
    }
    // Static locators are `private x = ...`; dynamic (parameterized) locators are
    // `private x(args): Locator {`. Both carry a locator-helper comment.
    const privates = content.match(/private \w+(?: =|\()/g) ?? [];
    const helpers = content.match(/\/\/ locator-helper:/g) ?? [];
    if (helpers.length !== privates.length) {
      throw new Error(`I1 failed in ${file}: locator-helper comments do not match private locator fields`);
    }
    if (!/\/\/ locator-helper: [^\n]+\n {2}private \w+(?: =|\()/m.test(content)) {
      throw new Error(`I1 failed in ${file}: locator-helper comment is not directly above private field`);
    }
  }
}

async function assertI2(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels"))
  ];
  for (const file of files) {
    if (file.endsWith("/BasePage.ts") || file.endsWith("/BasePanel.ts")) {
      continue;
    }
    const content = await readFile(path.join(result.root, file), "utf8");
    for (const pattern of FORBIDDEN_LOCATOR_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error(`I2 failed in ${file}: forbidden CSS selector matched (/${pattern.source}/)`);
      }
    }
  }
}

async function assertI3(result: ScenarioRunResult): Promise<void> {
  const files = await collectTsFiles(result.root, "pages");
  for (const file of files) {
    const content = await readFile(path.join(result.root, file), "utf8");
    const stepMethods = content.match(/async step_\w+\([^)]*\): Promise<this>/g) ?? [];
    if (stepMethods.length === 0) {
      continue;
    }
    const returnThisCount = (content.match(/return this;/g) ?? []).length;
    if (returnThisCount < stepMethods.length) {
      throw new Error(`I3 failed in ${file}: step methods do not consistently return this`);
    }
  }
}

async function assertI4(result: ScenarioRunResult): Promise<void> {
  const files = await collectTsFiles(result.root, "pages");
  for (const file of files) {
    const content = await readFile(path.join(result.root, file), "utf8");
    if (content.includes("verify_") && !/async verify_\w+\([^)]*\): Promise<this>/.test(content)) {
      throw new Error(`I4 failed in ${file}: verify methods do not return Promise<this>`);
    }
  }
}

async function assertI5(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels"))
  ];
  for (const file of files) {
    if (file.endsWith("/BasePage.ts") || file.endsWith("/BasePanel.ts")) {
      continue;
    }
    const content = await readFile(path.join(result.root, file), "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!/^\s+async (step_|verify_|get_|get[A-Z])/.test(line)) {
        continue;
      }
      let prev = i - 1;
      while (prev >= 0 && (lines[prev] ?? "").trim().length === 0) {
        prev -= 1;
      }
      const prevLine = prev >= 0 ? lines[prev] ?? "" : "";
      if (!prevLine.trim().endsWith("*/")) {
        throw new Error(`I5 failed in ${file}: method at line ${i + 1} is missing JSDoc`);
      }
    }
  }
}

async function assertI6(result: ScenarioRunResult): Promise<void> {
  for (const file of result.filesWritten) {
    if (!(await fileExists(result.root, file))) {
      throw new Error(`I6 failed: filesWritten includes missing file '${file}'`);
    }
  }
}

async function assertI7(result: ScenarioRunResult): Promise<void> {
  if (result.error === undefined) return;
  const pageExists = await fileExists(result.root, "pages/LoginPage.ts");
  if (pageExists) {
    throw new Error("I7 failed: structural error scenario still wrote LoginPage.ts");
  }
}

async function assertI8(result: ScenarioRunResult): Promise<void> {
  for (const step of result.stepResults) {
    if (step.mode !== "add_test_cases" || step.filesWritten === undefined) {
      continue;
    }
    const invalid = step.filesWritten.some((file) => !/^tests\/[^/]+\.spec\.ts$/.test(file));
    if (invalid) {
      throw new Error("I8 failed: add_test_cases should write only the spec file");
    }
  }
}

async function assertI9(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels"))
  ];
  for (const file of files) {
    if (file.endsWith("/BasePage.ts") || file.endsWith("/BasePanel.ts")) {
      continue;
    }
    const content = await readFile(path.join(result.root, file), "utf8");
    if (!content.startsWith("// AUTO-GENERATED")) {
      throw new Error(`I9 failed in ${file}: missing AUTO-GENERATED header`);
    }
  }
}

async function assertI10(result: ScenarioRunResult): Promise<void> {
  const specFiles = await collectTsFiles(result.root, "tests");
  for (const file of specFiles) {
    const content = await readFile(path.join(result.root, file), "utf8");
    if (!content.includes("test.describe(")) {
      throw new Error(`I10 failed in ${file}: missing test.describe block`);
    }
    const opens = (content.match(/\{/g) ?? []).length;
    const closes = (content.match(/\}/g) ?? []).length;
    if (opens !== closes) {
      throw new Error(`I10 failed in ${file}: unbalanced braces`);
    }
  }
}

async function assertI11(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels"))
  ];
  const combined = (
    await Promise.all(files.map((file) => readFile(path.join(result.root, file), "utf8")))
  ).join("\n");

  for (const [action, snippet] of Object.entries(ACTION_SNIPPETS)) {
    if (!combined.includes(snippet)) {
      throw new Error(`I11 failed: action '${action}' did not emit expected code snippet`);
    }
  }
}

async function assertI12(result: ScenarioRunResult): Promise<void> {
  const files = [
    ...(await collectTsFiles(result.root, "pages")),
    ...(await collectTsFiles(result.root, "panels")),
    ...(await collectTsFiles(result.root, "tests"))
  ];
  for (const file of files) {
    const content = await readFile(path.join(result.root, file), "utf8");
    for (const pattern of FORBIDDEN_LOCATOR_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error(`I12 failed in ${file}: forbidden CSS selector matched (/${pattern.source}/)`);
      }
    }
  }
}

const INVARIANT_CHECKS: Record<InvariantId, (result: ScenarioRunResult) => Promise<void>> = {
  I1: assertI1,
  I2: assertI2,
  I3: assertI3,
  I4: assertI4,
  I5: assertI5,
  I6: assertI6,
  I7: assertI7,
  I8: assertI8,
  I9: assertI9,
  I10: assertI10,
  I11: assertI11,
  I12: assertI12
};

export async function runInvariants(result: ScenarioRunResult, invariants: InvariantId[]): Promise<void> {
  for (const invariant of invariants) {
    await INVARIANT_CHECKS[invariant](result);
  }
}

export async function readScenarioFile(root: string, relativePath: string): Promise<string | undefined> {
  return readIfExists(root, relativePath);
}
