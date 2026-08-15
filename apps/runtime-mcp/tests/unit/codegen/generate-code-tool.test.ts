import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerGenerateCodeTool } from "../../../src/mcp/tools/generate-code-tool.js";
import { apiFullSchema, clientDef } from "../../shared/codegen-testkit/api-fixtures.js";
import { fullSchema } from "./helpers/fixtures.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}>;

function getToolHandler(server: McpServer, name: string): ToolHandler {
  const tools = (
    server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> }
  )._registeredTools;
  const tool = tools[name];
  if (tool === undefined) {
    throw new Error(`tool not registered: ${name}`);
  }
  return tool.handler;
}

function textFromResult(result: Awaited<ReturnType<ToolHandler>>): string {
  const block = result.content[0];
  return block !== undefined && block.type === "text" && block.text !== undefined ? block.text : "";
}

describe("generate-code-tool", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0" });
  });

  async function registerWithRoot(): Promise<ReturnType<typeof createProjectRoot>> {
    const ctx = await createProjectRoot();
    registerGenerateCodeTool(server, ctx.fs);
    return ctx;
  }

  async function registerWithApiRoot(): Promise<ReturnType<typeof createProjectRoot>> {
    const ctx = await createProjectRoot({ layer: "api" });
    registerGenerateCodeTool(server, ctx.fs);
    return ctx;
  }

  it("T1 — discriminated union failure returns structured isError JSON", async () => {
    await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({ mode: "create", feature: "login" });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(textFromResult(result)) as {
      error: string;
      field: string;
      message: string;
      fix: string;
    };
    expect(payload.error).toBe("schema_validation");
    expect(payload.field.length).toBeGreaterThan(0);
    expect(payload.fix.length).toBeGreaterThan(0);
  });

  it("T2 — validation fix field is actionable", async () => {
    await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "create",
      feature: "login",
      schema: {
        pages: [
          {
            feature: "login",
            page_class: "LoginPage",
            path: "/login",
            owned_by: "login",
            elements: [{ ref: "submit", tag: "button", role: "button", name: "Submit" }],
            types: [],
            steps: [
              {
                name: "step_submit",
                jsdoc: "Submit",
                params: [],
                actions: [{ do: "clck", ref: "submit" }]
              }
            ],
            verifies: []
          }
        ],
        spec: {
          suite: "App - Login",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [
            {
              ac_id: "AC-1",
              scenario: "Submit",
              title: "[AC-1] submit",
              body: [{ fixture: "loginPage", call: "step_submit" }]
            }
          ]
        }
      }
    });
    const payload = JSON.parse(textFromResult(result)) as { fix: string };
    expect(payload.fix.toLowerCase()).toMatch(/click|valid actions|fix/);
  });

  it("T3 — valid create input returns ok and filesWritten", async () => {
    const { fs } = await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "create",
      feature: "login",
      schema: fullSchema()
    });
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(textFromResult(result)) as {
      ok: boolean;
      filesWritten: string[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.filesWritten).toContain("tests/login.spec.ts");
    await expect(fs.read("tests/login.spec.ts")).resolves.toBeTypeOf("string");
  });

  it("T11 — notice included when generator returns notice", async () => {
    await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "create",
      feature: "login",
      schema: fullSchema({
        spec: {
          suite: "App - Login",
          generates_storage_state: "playwright/.auth/user.json",
          storage_state: null,
          before_each: null,
          cases: [
            {
              ac_id: "AC-1",
              scenario: "Auth",
              title: "[AC-1] should authenticate",
              body: [{ fixture: "loginPage", call: "step_navigate" }]
            }
          ]
        }
      })
    });
    const payload = JSON.parse(textFromResult(result)) as { notice?: string };
    expect(payload.notice).toContain("playwright.config.ts");
  });

  it("T12 — notice key absent when generator has no notice", async () => {
    await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "create",
      feature: "login",
      schema: fullSchema()
    });
    const payload = JSON.parse(textFromResult(result)) as Record<string, unknown>;
    expect("notice" in payload).toBe(false);
  });

  it("T13 — validate mode returns errors without writing files", async () => {
    const { fs } = await registerWithRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "validate",
      validateTarget: "create",
      feature: "auth",
      schema: fullSchema({
        pages: [
          {
            feature: "auth",
            page_class: "LoginPage",
            path: "/login",
            owned_by: "loginPage",
            elements: [{ ref: "email", tag: "input", testid: "email", testid_attr: "data-testid" }],
            types: [],
            steps: [
              { name: "step_navigate", jsdoc: "Go", params: [], actions: [{ do: "navigate" }] }
            ],
            verifies: []
          }
        ],
        spec: {
          suite: "Auth",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [
            {
              ac_id: "AC-1",
              scenario: "Login",
              title: "[AC-1] login",
              body: [{ fixture: "loginPage", call: "step_navigate" }]
            }
          ]
        }
      })
    });
    const payload = JSON.parse(textFromResult(result)) as {
      ok: boolean;
      valid: boolean;
      errors: Array<{ code: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.valid).toBe(false);
    expect(payload.errors.some((e) => e.code === "owned_by_mismatch")).toBe(true);
    await expect(fs.read("tests/auth.spec.ts")).rejects.toThrow();
  });

  it("T14 — create_api with an invalid shape returns structured isError JSON", async () => {
    await registerWithApiRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({ mode: "create_api", feature: "widgets" });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(textFromResult(result)) as {
      error: string;
      field: string;
      fix: string;
    };
    expect(payload.error).toBe("schema_validation");
    expect(payload.field.length).toBeGreaterThan(0);
    expect(payload.fix.length).toBeGreaterThan(0);
  });

  it("T15 — valid create_api input returns ok and filesWritten", async () => {
    const { fs } = await registerWithApiRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "create_api",
      feature: "widgets",
      schema: apiFullSchema()
    });
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(textFromResult(result)) as { ok: boolean; filesWritten: string[] };
    expect(payload.ok).toBe(true);
    expect(payload.filesWritten).toContain("tests/widgets.api.spec.ts");
    await expect(fs.read("tests/widgets.api.spec.ts")).resolves.toBeTypeOf("string");
  });

  it("T16 — register_client adds a client and wires barrel/config", async () => {
    const { fs } = await registerWithApiRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    await handler({ mode: "create_api", feature: "widgets", schema: apiFullSchema() });

    const result = await handler({
      mode: "register_client",
      feature: "widgets",
      client: clientDef({
        client_class: "GadgetClient",
        feature: "widgets",
        owned_by: "widgets",
        fixtures: ["gadgetApi"]
      })
    });
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(textFromResult(result)) as { ok: boolean; filesWritten: string[] };
    expect(payload.ok).toBe(true);
    expect(payload.filesWritten).toContain("clients/GadgetClient.ts");
    await expect(fs.read("clients/GadgetClient.ts")).resolves.toBeTypeOf("string");
  });

  it("T17 — add_api_test_cases appends to an existing api spec", async () => {
    const { fs } = await registerWithApiRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    await handler({ mode: "create_api", feature: "widgets", schema: apiFullSchema() });

    const result = await handler({
      mode: "add_api_test_cases",
      feature: "widgets",
      cases: [
        {
          ac_id: "AC-2",
          scenario: "Second Case",
          title: "[AC-2] should also work",
          calls: [
            {
              fixture: "widgetApi",
              method: "getAll",
              assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
            }
          ]
        }
      ]
    });
    expect(result.isError).not.toBe(true);
    const spec = await fs.read("tests/widgets.api.spec.ts");
    expect(spec).toContain("[AC-2] should also work");
  });

  it("T18 — validate_api mode returns errors without writing files", async () => {
    const { fs } = await registerWithApiRoot();
    const handler = getToolHandler(server, "vindicate_generate_code");
    const result = await handler({
      mode: "validate_api",
      validateTarget: "create_api",
      feature: "widgets",
      schema: apiFullSchema({
        clients: [clientDef({ client_class: "WidgetClient", owned_by: "other-feature" })]
      })
    });
    const payload = JSON.parse(textFromResult(result)) as {
      ok: boolean;
      valid: boolean;
      errors: Array<{ code: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.valid).toBe(false);
    expect(payload.errors.some((e) => e.code === "owned_by_mismatch")).toBe(true);
    await expect(fs.read("tests/widgets.api.spec.ts")).rejects.toThrow();
  });
});
