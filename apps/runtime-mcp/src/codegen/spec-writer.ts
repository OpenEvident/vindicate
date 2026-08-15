import { CodegenStructuralError } from "../shared/errors.js";
import { hasExpectedData, featureExpectedBarrelExport } from "./expected-ref.js";
import type { BodyCall, FullSchema, TestCase } from "./schema.js";

function fixtureParams(body: BodyCall[]): string {
  const fixtures = [...new Set(body.map((b) => b.fixture))];
  return `{ ${fixtures.join(", ")} }`;
}

function fixtureNameFromClass(pageClass: string): string {
  return pageClass.charAt(0).toLowerCase() + pageClass.slice(1);
}

function buildTestBlock(tc: TestCase): string {
  const fixtures = fixtureParams(tc.body);
  const bodyLines = tc.body.map((b) => {
    const args = b.args !== undefined ? b.args.join(", ") : "";
    return `    await ${b.fixture}.${b.call}(${args});`;
  });
  const testFn = tc.annotation !== undefined ? `test.${tc.annotation}` : "test";
  return [
    `  // scenario: ${tc.scenario}`,
    `  ${testFn}('${tc.title}', async (${fixtures}) => {`,
    ...bodyLines,
    `  });`
  ].join("\n");
}

export function buildNewSpec(schema: FullSchema, feature: string): string {
  const spec = schema.spec;
  const featureCamel = feature.replace(/-(.)/g, (_, c: string) => c.toUpperCase());
  const expectedImport = hasExpectedData(schema.expected)
    ? `import { ${featureCamel}Expected as expected } from '@config/page-loader';`
    : undefined;
  const storageStateLine =
    spec.storage_state !== null ? `\ntest.use({ storageState: '${spec.storage_state}' });\n` : "";

  const beforeEachBlock =
    spec.before_each !== null && spec.before_each.length > 0
      ? (() => {
          const fixtures = [...new Set(spec.before_each.map((b) => b.fixture))].join(", ");
          const bodyLines = spec.before_each.map((b) => {
            const args = b.args !== undefined ? b.args.join(", ") : "";
            return `    await ${b.fixture}.${b.call}(${args});`;
          });
          return ["", `  test.beforeEach(async ({ ${fixtures} }) => {`, ...bodyLines, `  });`].join(
            "\n"
          );
        })()
      : "";

  const testBlocks = spec.cases.map(buildTestBlock).join("\n\n");

  return [
    `// spec: .vindicate/stories/${feature}.story.md`,
    `import { test } from '@config/page.config';`,
    ...(expectedImport !== undefined ? [expectedImport] : []),
    storageStateLine,
    `test.describe('${spec.suite}', () => {`,
    beforeEachBlock,
    "",
    testBlocks,
    "",
    `});`,
    ""
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

export function buildAuthSetup(schema: FullSchema, feature: string): string {
  const spec = schema.spec;
  const storageStatePath = spec.generates_storage_state ?? "playwright/.auth/user.json";

  const firstCase = spec.cases[0];
  if (firstCase === undefined) {
    throw new CodegenStructuralError(
      "generates_storage_state requires at least one test case to derive the auth flow",
      "Add at least one test case to the spec"
    );
  }

  const bodyLines = firstCase.body.map((b) => {
    const args = b.args !== undefined ? b.args.join(", ") : "";
    return `  await ${b.fixture}.${b.call}(${args});`;
  });

  const fixtureImports = [...new Set(firstCase.body.map((b) => b.fixture))].map((fixture) => {
    const page = schema.pages.find((p) => fixtureNameFromClass(p.page_class) === fixture);
    if (page === undefined) {
      throw new CodegenStructuralError(
        `auth setup fixture '${fixture}' not found in pages for feature '${feature}'`,
        `Ensure fixture '${fixture}' maps to a page_class in the feature's page objects`
      );
    }
    return { fixture, pageClass: page.page_class };
  });

  const importClasses = fixtureImports.map((f) => f.pageClass).join(", ");
  const fixtureInitLines = fixtureImports.map(
    (f) => `  const ${f.fixture} = new ${f.pageClass}(page);`
  );

  const expectedImport = hasExpectedData(schema.expected)
    ? `import { ${featureExpectedBarrelExport(feature)} as expected } from '@config/page-loader';`
    : undefined;

  return [
    `import { test as setup } from '@playwright/test';`,
    `import { ${importClasses} } from '@config/page-loader';`,
    ...(expectedImport !== undefined ? [expectedImport] : []),
    ``,
    `setup('authenticate', async ({ page }) => {`,
    `  // Derived from first test case in ${feature} schema`,
    ...fixtureInitLines,
    ...bodyLines,
    `  await page.context().storageState({ path: '${storageStatePath}' });`,
    `});`,
    ``
  ].join("\n");
}

export function appendTestCases(existingContent: string, newCases: TestCase[]): string {
  const newBlocks = newCases.map(buildTestBlock).join("\n\n");
  const describeClosePattern = /\n\n\}\);\s*$/;
  const match = describeClosePattern.exec(existingContent);

  if (match === null) {
    throw new CodegenStructuralError(
      "Cannot find the closing of the test.describe block in the spec file",
      "The spec file may have been manually edited. Ensure the file ends with the closing '});' of the test.describe block."
    );
  }

  const insertionPoint = match.index;
  return (
    existingContent.slice(0, insertionPoint) +
    "\n\n" +
    newBlocks +
    existingContent.slice(insertionPoint)
  );
}
