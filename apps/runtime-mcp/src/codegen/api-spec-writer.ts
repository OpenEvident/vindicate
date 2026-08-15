/**
 * @file Pure transforms: ApiFullSchema/ApiTestCase[] → spec `.ts` source. The api-layer equivalent
 * of spec-writer.ts. Assertions render inline (`expect(response.status()).toBe(201)`), never
 * through a verify_*-style indirection — matches the fixed `vindicate-api` template's own convention
 * and ApiCallSchema's own doc comment.
 */
import { CodegenStructuralError } from "../shared/errors.js";
import type {
  ApiAssertion,
  ApiCall,
  ApiFullSchema,
  ApiTestCase,
  BuilderDef
} from "./api-schema.js";
import { hasExpectedData } from "./expected-ref.js";

function assertionSubjectExpression(assertion: ApiAssertion, responseVar: string): string {
  switch (assertion.subject) {
    case "status":
      return `${responseVar}.status()`;
    case "status_text":
      return `${responseVar}.statusText()`;
    case "body":
      return `await ${responseVar}.text()`;
    case "body_json":
      return `await ${responseVar}.json()`;
    case "header":
      return `${responseVar}.headers()['${assertion.header_name}']`;
  }
}

function assertionToLine(assertion: ApiAssertion, responseVar: string): string {
  const expr = assertionSubjectExpression(assertion, responseVar);
  const arg = assertion.arg ?? "";
  return `    expect(${expr}).${assertion.matcher}(${arg});`;
}

function captureLine(call: ApiCall, responseVar: string): string | undefined {
  if (call.capture === undefined) {
    return undefined;
  }
  const bodyExpr = `await ${responseVar}.json()`;
  const valueExpr =
    call.capture.field !== undefined ? `(${bodyExpr}).${call.capture.field}` : bodyExpr;
  return `    const ${call.capture.as} = ${valueExpr};`;
}

function callToLines(call: ApiCall, index: number): string[] {
  const responseVar = index === 0 ? "response" : `response${index + 1}`;
  const args = call.args !== undefined ? call.args.join(", ") : "";
  const capture = captureLine(call, responseVar);
  return [
    `    const ${responseVar} = await ${call.fixture}.${call.method}(${args});`,
    ...(capture !== undefined ? [capture] : []),
    ...call.assertions.map((a) => assertionToLine(a, responseVar))
  ];
}

function buildApiTestBlock(tc: ApiTestCase): string {
  const fixtures = [...new Set(tc.calls.map((c) => c.fixture))];
  const bodyLines = tc.calls.flatMap((call, index) => callToLines(call, index));
  const testFn = tc.annotation !== undefined ? `test.${tc.annotation}` : "test";
  return [
    `  // scenario: ${tc.scenario}`,
    `  ${testFn}('${tc.title}', async ({ ${fixtures.join(", ")} }) => {`,
    ...bodyLines,
    `  });`
  ].join("\n");
}

/** True when some call's args paste-verbatim `new <BuilderClass>(` — the only way a builder can be
 * referenced, since args are opaque TS expression strings, not a structured field. */
function usesBuilder(schema: ApiFullSchema, builder: BuilderDef): boolean {
  const needle = `new ${builder.builder_class}(`;
  return schema.spec.cases.some((tc) =>
    tc.calls.some((call) => (call.args ?? []).some((arg) => arg.includes(needle)))
  );
}

function builderImportLines(schema: ApiFullSchema): string[] {
  return (schema.builders ?? [])
    .filter((b) => usesBuilder(schema, b))
    .map((b) => `import { ${b.builder_class} } from '@builders/${b.builder_class}';`);
}

export function buildNewApiSpec(schema: ApiFullSchema, feature: string): string {
  const spec = schema.spec;
  const expectedImport = hasExpectedData(schema.expected)
    ? `import expected from '../support/data/${feature}/expected.json';`
    : undefined;

  const testBlocks = spec.cases.map(buildApiTestBlock).join("\n\n");

  return [
    `// spec: .vindicate/stories/${feature}.story.md`,
    ...builderImportLines(schema),
    `import { test, expect } from '@config/api.config';`,
    ...(expectedImport !== undefined ? [expectedImport] : []),
    "",
    `test.describe('${spec.suite}', () => {`,
    "",
    testBlocks,
    "",
    `});`,
    ""
  ].join("\n");
}

export function appendApiTestCases(existingContent: string, newCases: ApiTestCase[]): string {
  const newBlocks = newCases.map(buildApiTestBlock).join("\n\n");
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
