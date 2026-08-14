import { describe, expect, it } from "vitest";
import ts from "typescript";

import { appendApiTestCases, buildNewApiSpec } from "../../../src/codegen/api-spec-writer.js";
import { apiCall, apiFullSchema, apiTestCase } from "../../shared/codegen-testkit/api-fixtures.js";

function assertSyntacticallyValid(source: string): void {
  const sourceFile = ts.createSourceFile("generated.ts", source, ts.ScriptTarget.ESNext, true);
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  expect(diagnostics).toEqual([]);
}

describe("buildNewApiSpec", () => {
  it("imports test/expect from @config/api.config and writes the spec/suite header", () => {
    const source = buildNewApiSpec(apiFullSchema(), "widgets");
    expect(source).toContain("// spec: .vindicate/stories/widgets.story.md");
    expect(source).toContain("import { test, expect } from '@config/api.config';");
    expect(source).toContain("test.describe('App - Widgets', () => {");
    assertSyntacticallyValid(source);
  });

  it("renders one response const per call and destructures every fixture used", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [apiTestCase("AC-1", { calls: [apiCall("widgetApi", "getAll", { args: [] })] })]
        }
      }),
      "widgets"
    );
    expect(source).toContain("async ({ widgetApi }) => {");
    expect(source).toContain("const response = await widgetApi.getAll();");
    assertSyntacticallyValid(source);
  });

  it("numbers response vars response2, response3 for a multi-call case", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [
                apiCall("widgetApi", "create", { args: ["{}"] }),
                apiCall("widgetApi", "getAll", { args: [] }),
                apiCall("widgetApi", "delete", { args: ["1"] })
              ]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(source).toContain("const response = await widgetApi.create({});");
    expect(source).toContain("const response2 = await widgetApi.getAll();");
    expect(source).toContain("const response3 = await widgetApi.delete(1);");
    assertSyntacticallyValid(source);
  });

  it.each([
    ["status", "toBe", "200", undefined, "expect(response.status()).toBe(200);"],
    ["status_text", "toBe", "'OK'", undefined, "expect(response.statusText()).toBe('OK');"],
    ["body", "toContain", "'ok'", undefined, "expect(await response.text()).toContain('ok');"],
    ["body_json", "toMatchObject", "{ id: 1 }", undefined, "expect(await response.json()).toMatchObject({ id: 1 });"],
    [
      "header",
      "toContain",
      "'json'",
      "content-type",
      "expect(response.headers()['content-type']).toContain('json');"
    ]
  ] as const)("renders subject '%s' as the documented expression", (subject, matcher, arg, headerName, expectedLine) => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [
                apiCall("widgetApi", "getAll", {
                  args: [],
                  assertions: [
                    {
                      subject,
                      matcher,
                      arg,
                      ...(headerName !== undefined ? { header_name: headerName } : {})
                    }
                  ]
                })
              ]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(source).toContain(expectedLine);
    assertSyntacticallyValid(source);
  });

  it("omits the arg for toBeDefined-class matchers", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [
                apiCall("widgetApi", "getAll", {
                  args: [],
                  assertions: [{ subject: "body_json", matcher: "toBeDefined" }]
                })
              ]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(source).toContain("expect(await response.json()).toBeDefined();");
    assertSyntacticallyValid(source);
  });

  it("imports the expected default when the schema has data, aliased to 'expected'", () => {
    const source = buildNewApiSpec(apiFullSchema({ expected: { nonExistentId: 999 } }), "widgets");
    expect(source).toContain("import expected from '../support/data/widgets/expected.json';");
    assertSyntacticallyValid(source);
  });

  it("skips the expected import when the schema has no data", () => {
    const source = buildNewApiSpec(apiFullSchema(), "widgets");
    expect(source).not.toContain("expected.json");
  });

  it("imports a builder only when a call's args paste-reference 'new <BuilderClass>('", () => {
    const withBuilder = buildNewApiSpec(
      apiFullSchema({
        builders: [{ builder_class: "WidgetPayloadBuilder", target_type: "Widget", fields: [{ name: "name", type: "string", default: "'x'" }] }],
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [apiCall("widgetApi", "create", { args: ["new WidgetPayloadBuilder().build()"] })]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(withBuilder).toContain("import { WidgetPayloadBuilder } from '@builders/WidgetPayloadBuilder';");
    assertSyntacticallyValid(withBuilder);

    const withoutUsage = buildNewApiSpec(
      apiFullSchema({
        builders: [{ builder_class: "WidgetPayloadBuilder", target_type: "Widget", fields: [{ name: "name", type: "string", default: "'x'" }] }]
      }),
      "widgets"
    );
    expect(withoutUsage).not.toContain("WidgetPayloadBuilder");
  });

  it("captures the whole JSON body into a real variable when capture has no field", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [apiCall("widgetApi", "create", { args: ["{}"], capture: { as: "createdWidget" } })]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(source).toContain("const response = await widgetApi.create({});");
    expect(source).toContain("const createdWidget = await response.json();");
    assertSyntacticallyValid(source);
  });

  it("captures one field of the JSON body, and a later call can reference it (the reported createdPet.id bug, fixed)", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [
            apiTestCase("AC-1", {
              calls: [
                apiCall("widgetApi", "create", { args: ["{}"], capture: { as: "createdWidgetId", field: "id" } }),
                apiCall("widgetApi", "getById", { args: ["createdWidgetId"] })
              ]
            })
          ]
        }
      }),
      "widgets"
    );
    expect(source).toContain("const response = await widgetApi.create({});");
    expect(source).toContain("const createdWidgetId = (await response.json()).id;");
    expect(source).toContain("const response2 = await widgetApi.getById(createdWidgetId);");
    // createdWidgetId is declared before it's referenced — genuinely in scope, not a dangling name.
    expect(source.indexOf("const createdWidgetId =")).toBeLessThan(source.indexOf("getById(createdWidgetId)"));
    assertSyntacticallyValid(source);
  });

  it("omits the capture line entirely when capture is absent — response line goes straight to assertions", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [apiTestCase("AC-1", { calls: [apiCall("widgetApi", "getAll", { args: [] })] })]
        }
      }),
      "widgets"
    );
    expect(source).toContain(
      "const response = await widgetApi.getAll();\n    expect(response.status()).toBe(200);"
    );
  });

  it("renders a fixme/skip annotation on test.<annotation>", () => {
    const source = buildNewApiSpec(
      apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: null,
          cases: [apiTestCase("AC-1", { annotation: "skip" })]
        }
      }),
      "widgets"
    );
    expect(source).toContain("test.skip('[AC-1] should complete the flow'");
    assertSyntacticallyValid(source);
  });
});

describe("appendApiTestCases", () => {
  it("inserts new test blocks before the closing describe", () => {
    const existing = buildNewApiSpec(apiFullSchema(), "widgets");
    const appended = appendApiTestCases(existing, [
      apiTestCase("AC-2", { scenario: "Second Case", calls: [apiCall("widgetApi", "getAll", { args: [] })] })
    ]);
    expect(appended).toContain("[AC-1] should complete the flow");
    expect(appended).toContain("[AC-2] should complete the flow");
    expect(appended.indexOf("AC-1")).toBeLessThan(appended.indexOf("AC-2"));
    assertSyntacticallyValid(appended);
  });

  it("throws CodegenStructuralError when the describe close can't be found", () => {
    expect(() => appendApiTestCases("not a real spec file", [apiTestCase("AC-2")])).toThrow(
      /Cannot find the closing/
    );
  });
});
