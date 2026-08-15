import type { ProjectFs } from "../fs/project-fs.js";
import { CodegenStructuralError, FileNotFoundError } from "../shared/errors.js";
import { assertNoValidationErrors } from "./assert-validation.js";
import {
  escapeRegExp,
  fileExists,
  flushWrites,
  insertAfterAnchor,
  insertBeforeAnchor,
  resolveEffectiveFs,
  type WriteEntry
} from "./codegen-fs.js";
import { featureExpectedBarrelExport, hasExpectedData } from "./expected-ref.js";
import { buildPageObject, type BuildPageObjectOptions } from "./page-object.js";
import { appendTestCases, buildAuthSetup, buildNewSpec } from "./spec-writer.js";
import type { FullSchema, GenerateCodeInput, PageDef, TestCase } from "./schema.js";
import { fixtureNameFromClass, validateFullSchema } from "./validate-codegen.js";
import { runValidate } from "./validate-runner.js";
import type { ValidationResult } from "./validation-errors.js";

function pageObjectBuildOptions(
  schema: FullSchema,
  feature: string
): BuildPageObjectOptions | undefined {
  if (schema.expected === undefined) {
    return undefined;
  }
  return { expectedBarrelExport: featureExpectedBarrelExport(feature) };
}

export interface GeneratorResult {
  readonly filesWritten: string[];
  readonly notice?: string;
}

export type CodegenRunResult = GeneratorResult | ValidationResult;

/**
 * Derives the Playwright fixture name from a page class name.
 * Re-exported from validate-codegen for barrel consumers.
 */
const fixtureNameFromPageClass = fixtureNameFromClass;

/**
 * Pure transform: applies all owned-page exports to an in-memory page-loader
 * snapshot in a single pass. Reads happen before this call; one write follows.
 */
function applyPageLoaderUpdates(
  content: string,
  ownedPages: PageDef[],
  feature: string,
  hasExpected: boolean
): string {
  let current = content;

  for (const page of ownedPages) {
    if (current.includes(`{ ${page.page_class} }`)) {
      continue;
    }
    const pageSubdir = page.is_panel === true ? "panels" : "pages";
    const anchor =
      page.is_panel === true
        ? "// ── Panels ───────────────────────────────────────────────────"
        : "// ── Page Objects ─────────────────────────────────────────────";
    const pageExport = `export { ${page.page_class} } from '../../${pageSubdir}/${page.page_class}';`;
    current = insertAfterAnchor(current, anchor, pageExport);
  }

  if (hasExpected) {
    const dataAnchor = "// ── Test Data ────────────────────────────────────────────────";
    const featureCamel = feature.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
    const dataExport = `export { default as ${featureCamel}Expected } from '../data/${feature}/expected.json';`;
    if (!current.includes(`${featureCamel}Expected`)) {
      current = insertAfterAnchor(current, dataAnchor, dataExport);
    }
  }

  return current;
}

/** True when a non-comment fixture type line is already present. */
function isFixtureRegistered(content: string, fixtureName: string, pageClass: string): boolean {
  const typePattern = new RegExp(
    `^\\s*${escapeRegExp(fixtureName)}:\\s*${escapeRegExp(pageClass)}\\s*;`,
    "m"
  );
  return typePattern.test(content);
}

function isPageImportRegistered(content: string, pageClass: string): boolean {
  const importPattern = new RegExp(
    `^import\\s*\\{\\s*${escapeRegExp(pageClass)}\\s*\\}\\s*from\\s*['"]\\./page-loader['"];`,
    "m"
  );
  return importPattern.test(content);
}

/**
 * Pure transform: applies all owned-page fixture registrations to an in-memory
 * page.config snapshot in a single pass.
 */
function applyPageConfigUpdates(content: string, ownedPages: PageDef[]): string {
  let current = content;

  const importAnchor =
    "// grow_tests appends one import line per new page class above this comment.";
  const typeAnchor =
    "// fixture-types: grow_tests appends one type entry per feature below this line";
  const implAnchor =
    "// fixture-impls: grow_tests appends one fixture entry per feature below this line";

  for (const page of ownedPages) {
    const fixtureName = fixtureNameFromPageClass(page.page_class);
    if (isFixtureRegistered(current, fixtureName, page.page_class)) {
      continue;
    }
    if (!isPageImportRegistered(current, page.page_class)) {
      current = insertBeforeAnchor(
        current,
        importAnchor,
        `import { ${page.page_class} } from './page-loader';`
      );
    }
    current = insertAfterAnchor(current, typeAnchor, `  ${fixtureName}: ${page.page_class};`);
    current = insertAfterAnchor(
      current,
      implAnchor,
      `  ${fixtureName}: async ({ page }, use) => { await use(new ${page.page_class}(page)); },`
    );
  }

  return current;
}

function runStructuralChecks(schema: FullSchema, options?: { feature?: string }): void {
  assertNoValidationErrors(
    validateFullSchema(schema, options?.feature !== undefined ? options.feature : undefined)
  );
}

function pageObjectPath(page: PageDef): string {
  const pageDir = page.is_panel === true ? "panels" : "pages";
  return `${pageDir}/${page.page_class}.ts`;
}

async function assertCreateNotClobbered(
  fs: ProjectFs,
  feature: string,
  ownedPages: PageDef[],
  overwrite?: boolean
): Promise<void> {
  if (overwrite === true) {
    return;
  }

  if (await fileExists(fs, `tests/${feature}.spec.ts`)) {
    throw new CodegenStructuralError(
      `Feature spec already exists: 'tests/${feature}.spec.ts'`,
      "Use overwrite:true to regenerate from scratch, or edit the existing spec directly."
    );
  }

  for (const page of ownedPages) {
    if (page.owned_by !== feature) {
      continue;
    }
    const path = pageObjectPath(page);
    if (await fileExists(fs, path)) {
      throw new CodegenStructuralError(
        `Page object already exists: '${path}'`,
        "Use overwrite:true to regenerate from scratch, or edit the existing page object directly."
      );
    }
  }
}

async function runCreate(
  fs: ProjectFs,
  feature: string,
  schema: FullSchema,
  overwrite?: boolean
): Promise<GeneratorResult> {
  runStructuralChecks(schema, { feature });

  const ownedPages = schema.pages.filter((p) => p.owned_by === feature);
  await assertCreateNotClobbered(fs, feature, ownedPages, overwrite);

  const writes: WriteEntry[] = [];
  let notice: string | undefined;

  const pageObjectOptions = pageObjectBuildOptions(schema, feature);

  for (const page of ownedPages) {
    writes.push({
      path: pageObjectPath(page),
      content: buildPageObject(page, pageObjectOptions)
    });
  }

  const pageLoaderContent = await fs.read("support/config/page-loader.ts");
  writes.push({
    path: "support/config/page-loader.ts",
    content: applyPageLoaderUpdates(
      pageLoaderContent,
      ownedPages,
      feature,
      hasExpectedData(schema.expected)
    )
  });

  const pageConfigContent = await fs.read("support/config/page.config.ts");
  writes.push({
    path: "support/config/page.config.ts",
    content: applyPageConfigUpdates(pageConfigContent, ownedPages)
  });

  writes.push({ path: `tests/${feature}.spec.ts`, content: buildNewSpec(schema, feature) });

  if (schema.spec.generates_storage_state !== null) {
    writes.push({ path: "auth.setup.ts", content: buildAuthSetup(schema, feature) });
    notice =
      "auth.setup.ts written. Manual step required: add a 'setup' project to playwright.config.ts " +
      "that runs auth.setup.ts before the main test project. " +
      "See the Playwright docs: https://playwright.dev/docs/auth#basic-shared-account-in-all-tests";
  }

  if (hasExpectedData(schema.expected)) {
    writes.push({
      path: `support/data/${feature}/expected.json`,
      content: `${JSON.stringify(schema.expected, null, 2)}\n`
    });
  }

  return {
    filesWritten: await flushWrites(fs, writes),
    ...(notice !== undefined ? { notice } : {})
  };
}

async function runAddTestCases(
  fs: ProjectFs,
  feature: string,
  cases: TestCase[]
): Promise<GeneratorResult> {
  let existingSpec: string;
  try {
    existingSpec = await fs.read(`tests/${feature}.spec.ts`);
  } catch (err: unknown) {
    if (err instanceof FileNotFoundError) {
      throw new CodegenStructuralError(
        `Spec file not found: 'tests/${feature}.spec.ts'`,
        "Run mode:'create' first to create the feature spec."
      );
    }
    throw err;
  }

  const newSpecContent = appendTestCases(existingSpec, cases);

  return {
    filesWritten: await flushWrites(fs, [
      { path: `tests/${feature}.spec.ts`, content: newSpecContent }
    ])
  };
}

function validateRegisterPage(page: PageDef, feature: string): void {
  if (page.owned_by !== feature) {
    throw new CodegenStructuralError(
      `Page owned_by '${page.owned_by}' does not match feature '${feature}'`,
      "Set page.owned_by to the feature slug (e.g. 'auth'), not the fixture name."
    );
  }

  const firstStepOrVerify =
    page.steps[0] ??
    page.verifies[0] ??
    (() => {
      throw new CodegenStructuralError(
        `Page '${page.page_class}' must define at least one step_* or verify_* method`,
        "Add steps and verifies to the page definition before register_page."
      );
    })();

  // Dummy args matching firstStepOrVerify's real param count — otherwise any page whose first
  // step/verify takes params would always fail body_call_arg_count here, even though
  // register_page isn't actually validating a real call.
  const dummyArgs = firstStepOrVerify.params.map(() => "1");

  const fixtureName = fixtureNameFromPageClass(page.page_class);
  const syntheticSchema: FullSchema = {
    pages: [page],
    spec: {
      suite: "Validate",
      generates_storage_state: null,
      storage_state: null,
      before_each: null,
      cases: [
        {
          ac_id: "AC-0",
          scenario: "Validate",
          title: "[AC-0] validate",
          body: [{ fixture: fixtureName, call: firstStepOrVerify.name, args: dummyArgs }]
        }
      ]
    }
  };
  runStructuralChecks(syntheticSchema, { feature });
}

async function runRegisterPage(
  fs: ProjectFs,
  feature: string,
  page: PageDef
): Promise<GeneratorResult> {
  validateRegisterPage(page, feature);

  const targetPath = pageObjectPath(page);
  if (await fileExists(fs, targetPath)) {
    throw new CodegenStructuralError(
      `Page object already exists: '${targetPath}'`,
      "Edit the existing page object directly, or delete it before register_page."
    );
  }

  let pageObjectOptions: BuildPageObjectOptions | undefined;
  if (await fileExists(fs, `support/data/${feature}/expected.json`)) {
    pageObjectOptions = { expectedBarrelExport: featureExpectedBarrelExport(feature) };
  }

  const pageLoaderContent = await fs.read("support/config/page-loader.ts");
  const pageConfigContent = await fs.read("support/config/page.config.ts");

  return {
    filesWritten: await flushWrites(fs, [
      { path: targetPath, content: buildPageObject(page, pageObjectOptions) },
      {
        path: "support/config/page-loader.ts",
        content: applyPageLoaderUpdates(pageLoaderContent, [page], feature, false)
      },
      {
        path: "support/config/page.config.ts",
        content: applyPageConfigUpdates(pageConfigContent, [page])
      }
    ])
  };
}

export async function runGenerator(
  fs: ProjectFs,
  input: GenerateCodeInput,
  pathGuard?: (relativePath: string) => Promise<void>
): Promise<CodegenRunResult> {
  if (input.mode === "validate") {
    return runValidate(fs, input);
  }
  const effectiveFs = await resolveEffectiveFs(fs, pathGuard);
  switch (input.mode) {
    case "create":
      return runCreate(effectiveFs, input.feature, input.schema, input.overwrite);
    case "add_test_cases":
      return runAddTestCases(effectiveFs, input.feature, input.cases);
    case "register_page":
      return runRegisterPage(effectiveFs, input.feature, input.page);
  }
}
