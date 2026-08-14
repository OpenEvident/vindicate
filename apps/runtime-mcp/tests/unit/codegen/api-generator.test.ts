import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { runApiGenerator } from "../../../src/codegen/api-generator.js";
import { CodegenStructuralError } from "../../../src/shared/errors.js";
import { apiFullSchema, builderDef, clientDef, clientMethod } from "../../shared/codegen-testkit/api-fixtures.js";
import { compileGeneratedApiProject } from "../../codegen-lab/lib/api-compile-check.js";
import { expectWritten } from "./helpers/expect-written.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

function assertSyntacticallyValid(source: string, label: string): void {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.ESNext, true);
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  expect(diagnostics, `${label} should parse with no syntax errors`).toEqual([]);
}

describe("api-generator create_api", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  it("A1 — writes the client, spec, and wires client-loader.ts + api.config.ts", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = expectWritten(await runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() }));
    expect(result.filesWritten).toContain("clients/WidgetClient.ts");
    expect(result.filesWritten).toContain("tests/widgets.api.spec.ts");
    expect(result.filesWritten).toContain("support/config/client-loader.ts");
    expect(result.filesWritten).toContain("support/config/api.config.ts");

    const loader = await fs.read("support/config/client-loader.ts");
    expect(loader).toContain("export { WidgetClient } from '../../clients/WidgetClient';");

    const config = await fs.read("support/config/api.config.ts");
    expect(config).toContain("import { WidgetClient } from './client-loader';");
    expect(config).toContain("widgetApi: WidgetClient;");
    expect(config).toContain("widgetApi: async ({ apiRequest }, use) => { await use(new WidgetClient(apiRequest)); },");
  });

  it("A2 — refuses when the spec already exists without overwrite, succeeds with overwrite:true", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() });
    await expect(
      runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() })
    ).rejects.toThrow(CodegenStructuralError);

    const result = expectWritten(
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "widgets",
        schema: apiFullSchema(),
        overwrite: true
      })
    );
    expect(result.filesWritten).toContain("tests/widgets.api.spec.ts");
  });

  it("A3 — writes a builder file when builders[] is present", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = expectWritten(
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "widgets",
        schema: apiFullSchema({
          builders: [builderDef({ builder_class: "WidgetPayloadBuilder", target_type: "Widget" })]
        })
      })
    );
    expect(result.filesWritten).toContain("builders/WidgetPayloadBuilder.ts");
    const source = await fs.read("builders/WidgetPayloadBuilder.ts");
    expect(source).toContain("export class WidgetPayloadBuilder {");
  });

  it("A4 — writes support/data/<feature>/expected.json when expected is present", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = expectWritten(
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "widgets",
        schema: apiFullSchema({ expected: { nonExistentId: 999 } })
      })
    );
    expect(result.filesWritten).toContain("support/data/widgets/expected.json");
    const data = await fs.read("support/data/widgets/expected.json");
    expect(JSON.parse(data)).toEqual({ nonExistentId: 999 });
  });

  it("A5 — omits expected.json when expected is absent", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = expectWritten(
      await runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() })
    );
    expect(result.filesWritten).not.toContain("support/data/widgets/expected.json");
  });

  it("A6 — auth_setup wires authApiRequest/authToken/authenticatedRequest with feature-prefixed env vars", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await runApiGenerator(fs, {
      mode: "create_api",
      feature: "widgets",
      schema: apiFullSchema({
        spec: {
          suite: "App - Widgets",
          auth_setup: {
            login_http_method: "post",
            login_path: "auth/login",
            credential_params: [
              { name: "username", type: "string" },
              { name: "password", type: "string" }
            ],
            token_field: "accessToken",
            header_name: "Authorization",
            header_value_template: "Bearer {token}"
          },
          cases: apiFullSchema().spec.cases
        }
      })
    });

    const config = await fs.read("support/config/api.config.ts");
    expect(config).toContain("authApiRequest: APIRequestContext;");
    expect(config).toContain("authToken: string;");
    expect(config).toContain("authenticatedRequest: APIRequestContext;");
    expect(config).toContain("process.env.WIDGETS_USERNAME!");
    expect(config).toContain("process.env.WIDGETS_PASSWORD!");
    expect(config).toContain("await authApiRequest.post('auth/login', {");
    expect(config).toContain("await use(body.accessToken);");
    expect(config).toContain("'Authorization': `Bearer ${authToken}`,");
    assertSyntacticallyValid(config, "api.config.ts");
  });

  it("A7 — rejects a schema whose client owned_by doesn't match the create_api feature", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await expect(
      runApiGenerator(fs, {
        mode: "create_api",
        feature: "widgets",
        schema: apiFullSchema({ clients: [clientDef({ client_class: "WidgetClient", owned_by: "other-feature" })] })
      })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("A7b — rejects a fixture name already bound to a different client in api.config.ts, without writing anything", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() }); // registers widgetApi -> WidgetClient

    await expect(
      runApiGenerator(fs, {
        mode: "create_api",
        feature: "billing",
        schema: apiFullSchema({
          clients: [
            clientDef({
              client_class: "GadgetClient",
              feature: "billing",
              owned_by: "billing",
              fixtures: ["widgetApi"]
            })
          ]
        })
      })
    ).rejects.toThrow(CodegenStructuralError);

    // Nothing from the rejected call should have landed on disk.
    await expect(fs.read("clients/GadgetClient.ts")).rejects.toThrow();
    const config = await fs.read("support/config/api.config.ts");
    expect(config).toContain("widgetApi: async ({ apiRequest }, use) => { await use(new WidgetClient(apiRequest)); },");
    expect(config).not.toContain("GadgetClient");
  });

  it("A8 — missing barrel anchor throws CodegenStructuralError", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await fs.write("support/config/client-loader.ts", "// scaffold file without anchor comments\n");
    await expect(
      runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("A9 — end to end against the real api/ scaffold template: every written file is syntactically valid TS", async () => {
    const { fs } = await createProjectRoot({ layer: "api", scaffoldPreset: "production" });
    const result = expectWritten(
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "widgets",
        schema: apiFullSchema({
          builders: [builderDef({ builder_class: "WidgetPayloadBuilder", target_type: "Widget" })],
          expected: { nonExistentId: 999 }
        })
      })
    );
    for (const path of result.filesWritten) {
      if (!path.endsWith(".ts")) {
        continue;
      }
      const content = await fs.read(path);
      assertSyntacticallyValid(content, path);
    }
  });

  it(
    "A10 — end to end against the real api/ scaffold template: real tsc --noEmit passes, including a hyphenated feature/param auth_setup",
    { timeout: 60_000 },
    async () => {
      const { fs, root } = await createProjectRoot({ layer: "api", scaffoldPreset: "production" });
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "user-profile",
        schema: apiFullSchema({
          clients: [
            clientDef({
              client_class: "WidgetClient",
              feature: "user-profile",
              owned_by: "user-profile",
              fixtures: ["widgetApi"],
              types: [{ name: "Widget", fields: [{ name: "id", type: "number" }, { name: "name", type: "string" }] }],
              methods: [
                clientMethod("getAll", { http_method: "get", path: "widgets" }),
                clientMethod("getByOwner", {
                  http_method: "get",
                  path: "orgs/{orgId}/widgets/{widgetId}",
                  path_params: [
                    { name: "orgId", type: "string" },
                    { name: "widgetId", type: "number" }
                  ]
                })
              ]
            })
          ],
          builders: [
            builderDef({
              builder_class: "WidgetPayloadBuilder",
              target_type: "Widget",
              owning_client: "WidgetClient",
              fields: [
                { name: "id", type: "number", default: "1" },
                { name: "name", type: "string", default: "'a widget'" }
              ]
            })
          ],
          expected: { nonExistentId: 999 },
          spec: {
            suite: "App - User Profile",
            auth_setup: {
              login_http_method: "post",
              login_path: "auth/login",
              // Hyphenated feature (above) + an underscore-bearing param name — the exact shape that
              // produced an invalid `process.env.USER-PROFILE_...` subtraction expression before the
              // envVarToken fix.
              credential_params: [{ name: "api_key", type: "string" }],
              token_field: "accessToken",
              header_name: "Authorization",
              header_value_template: "Bearer {token}"
            },
            cases: [
              {
                ac_id: "AC-1",
                scenario: "Get All",
                title: "[AC-1] should list widgets",
                calls: [
                  {
                    fixture: "widgetApi",
                    method: "getAll",
                    assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
                  }
                ]
              }
            ]
          }
        })
      });

      await compileGeneratedApiProject(root);
    }
  );

  it(
    "A11 — Petstore-shaped scenario (create then capture-fetch-by-id) compiles for real with tsc",
    { timeout: 60_000 },
    async () => {
      // Mirrors the reported real-world scenario end to end: create a Pet, capture its returned id,
      // and use that id in a second call — the exact "createdPet.id never defined" bug, now fixed
      // via ApiCall.capture. Proven with a REAL tsc --noEmit, not just syntax parsing, so the
      // captured variable's presence/type is genuinely checked, not just its text shape.
      const { fs, root } = await createProjectRoot({ layer: "api", scaffoldPreset: "production" });
      await runApiGenerator(fs, {
        mode: "create_api",
        feature: "pets",
        schema: apiFullSchema({
          clients: [
            clientDef({
              client_class: "PetClient",
              feature: "pets",
              owned_by: "pets",
              fixtures: ["petApi"],
              types: [
                { name: "Pet", fields: [{ name: "id?", type: "number" }, { name: "name", type: "string" }, { name: "status", type: "string" }] }
              ],
              methods: [
                clientMethod("addPet", {
                  http_method: "post",
                  path: "pet",
                  body_param: { name: "pet", type: "Pet" },
                  body_type: "json"
                }),
                clientMethod("getPetById", {
                  http_method: "get",
                  path: "pet/{petId}",
                  path_params: [{ name: "petId", type: "number" }]
                })
              ]
            })
          ],
          builders: [
            builderDef({
              builder_class: "PetPayloadBuilder",
              target_type: "Pet",
              owning_client: "PetClient",
              fields: [
                { name: "name", type: "string", default: "'VindicateTestPet'" },
                { name: "status", type: "string", default: "'available'" }
              ]
            })
          ],
          spec: {
            suite: "Acme - Pets",
            auth_setup: null,
            cases: [
              {
                ac_id: "AC-1",
                scenario: "Create And Fetch",
                title: "[AC-1] should create a pet and retrieve it by id",
                calls: [
                  {
                    fixture: "petApi",
                    method: "addPet",
                    args: ["new PetPayloadBuilder().build()"],
                    capture: { as: "createdPet" },
                    assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
                  },
                  {
                    fixture: "petApi",
                    method: "getPetById",
                    args: ["createdPet.id"],
                    assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
                  }
                ]
              }
            ]
          }
        })
      });

      await compileGeneratedApiProject(root);
    }
  );

  it("A12 — validate_api rejects the exact reported-bug shapes together: unquoted default, leading-slash path, missing [AC-n], undeclared capture reference", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = await runApiGenerator(fs, {
      mode: "validate_api",
      validateTarget: "create_api",
      feature: "pets",
      schema: apiFullSchema({
        clients: [
          clientDef({
            client_class: "PetClient",
            feature: "pets",
            owned_by: "pets",
            fixtures: ["petApi"],
            methods: [
              clientMethod("addPet", {
                http_method: "post",
                path: "/pet", // leading slash — the baseURL-joining trap
                body_param: { name: "pet", type: "Pet" },
                body_type: "json"
              }),
              clientMethod("getPetById", {
                http_method: "get",
                path: "pet/{petId}",
                path_params: [{ name: "petId", type: "number" }]
              })
            ]
          })
        ],
        builders: [
          builderDef({
            builder_class: "PetPayloadBuilder",
            target_type: "Pet",
            fields: [
              { name: "name", type: "string", default: "VindicateTestPet" }, // unquoted — the reported bug
              { name: "status", type: "string", default: "available" } // unquoted — the reported bug
            ]
          })
        ],
        spec: {
          suite: "Acme - Pets",
          auth_setup: null,
          cases: [
            {
              ac_id: "AC-1",
              scenario: "Create And Fetch",
              title: "should create a pet and retrieve it by ID", // missing [AC-1] — the reported bug
              calls: [
                {
                  fixture: "petApi",
                  method: "addPet",
                  args: ["new PetPayloadBuilder().build()"],
                  // no `capture` — createdPet is referenced below with nothing ever declaring it,
                  // the reported "createdPet never defined" bug.
                  assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
                },
                {
                  fixture: "petApi",
                  method: "getPetById",
                  args: ["createdPet.id"],
                  assertions: [{ subject: "status", matcher: "toBe", arg: "200" }]
                }
              ]
            }
          ]
        }
      })
    });

    expect("errors" in result).toBe(true);
    if (!("errors" in result)) {
      return;
    }
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("unquoted_string_builder_default");
    expect(codes).toContain("leading_slash_path");
    expect(codes).toContain("missing_ac_prefix");
    // The undeclared createdPet.id reference is syntactically valid TS (a property access on an
    // identifier) — validate_api's syntax-only check can't catch it (the same blind spot a real
    // tsc run closes, exercised for the FIXED version in A11 above). This is why `capture` exists
    // as an explicit field rather than leaving cross-call data-passing to be inferred.
  });
});

describe("api-generator add_api_test_cases", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  it("B1 — appends a new case to an existing spec", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await runApiGenerator(fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() });
    const result = expectWritten(
      await runApiGenerator(fs, {
        mode: "add_api_test_cases",
        feature: "widgets",
        cases: [
          {
            ac_id: "AC-2",
            scenario: "Second Case",
            title: "[AC-2] should also work",
            calls: [{ fixture: "widgetApi", method: "getAll", assertions: [{ subject: "status", matcher: "toBe", arg: "200" }] }]
          }
        ]
      })
    );
    expect(result.filesWritten).toContain("tests/widgets.api.spec.ts");
    const spec = await fs.read("tests/widgets.api.spec.ts");
    expect(spec).toContain("[AC-2] should also work");
  });

  it("B2 — throws when the spec file doesn't exist yet", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    await expect(
      runApiGenerator(fs, {
        mode: "add_api_test_cases",
        feature: "widgets",
        cases: [
          {
            ac_id: "AC-1",
            scenario: "First",
            title: "[AC-1] should work",
            calls: [{ fixture: "widgetApi", method: "getAll", assertions: [{ subject: "status", matcher: "toBe", arg: "200" }] }]
          }
        ]
      })
    ).rejects.toThrow(CodegenStructuralError);
  });
});

describe("api-generator register_client", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  async function seedWidgetsProject() {
    const ctx = await createProjectRoot({ layer: "api" });
    await runApiGenerator(ctx.fs, { mode: "create_api", feature: "widgets", schema: apiFullSchema() });
    return ctx;
  }

  const gadgetClient = clientDef({
    client_class: "GadgetClient",
    feature: "widgets",
    owned_by: "widgets",
    fixtures: ["gadgetApi"],
    methods: [clientMethod("getAll", { http_method: "get", path: "gadgets" })]
  });

  it("C1 — writes the client and wires barrel/config", async () => {
    const { fs } = await seedWidgetsProject();
    const result = expectWritten(await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client: gadgetClient }));
    expect(result.filesWritten).toContain("clients/GadgetClient.ts");
    const loader = await fs.read("support/config/client-loader.ts");
    expect(loader).toContain("export { GadgetClient }");
    const config = await fs.read("support/config/api.config.ts");
    expect(config).toContain("gadgetApi: GadgetClient;");
  });

  it("C2 — refuses when the client file already exists", async () => {
    const { fs } = await seedWidgetsProject();
    await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client: gadgetClient });
    await expect(
      runApiGenerator(fs, { mode: "register_client", feature: "widgets", client: gadgetClient })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("C3 — idempotent barrel wiring on re-run after delete: no duplicate export/fixture lines", async () => {
    const { fs } = await seedWidgetsProject();
    await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client: gadgetClient });
    // register_client itself refuses a re-run while the client file still exists (C2) — delete it
    // to reach the barrel-wiring idempotency this test actually targets, same as a real recovery
    // from an interrupted run.
    await fs.delete("clients/GadgetClient.ts");
    await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client: gadgetClient });

    const loader = await fs.read("support/config/client-loader.ts");
    expect((loader.match(/export \{ GadgetClient \}/g) ?? []).length).toBe(1);
    const config = await fs.read("support/config/api.config.ts");
    expect((config.match(/gadgetApi: GadgetClient;/g) ?? []).length).toBe(1);
    expect((config.match(/import \{ GadgetClient \}/g) ?? []).length).toBe(1);
  });

  it("C7 — rejects a fixture name already bound to a different client, without writing the new client file", async () => {
    const { fs } = await seedWidgetsProject();
    await expect(
      runApiGenerator(fs, {
        mode: "register_client",
        feature: "widgets",
        client: { ...gadgetClient, fixtures: ["widgetApi"] } // widgetApi already belongs to WidgetClient
      })
    ).rejects.toThrow(CodegenStructuralError);

    await expect(fs.read("clients/GadgetClient.ts")).rejects.toThrow();
    const config = await fs.read("support/config/api.config.ts");
    expect(config).not.toContain("GadgetClient");
  });

  it("C4 — rejects owned_by mismatch", async () => {
    const { fs } = await seedWidgetsProject();
    await expect(
      runApiGenerator(fs, {
        mode: "register_client",
        feature: "widgets",
        client: { ...gadgetClient, owned_by: "billing" }
      })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("C5 — accepts a client whose first method requires a path param", async () => {
    const { fs } = await seedWidgetsProject();
    const client = clientDef({
      client_class: "GadgetClient",
      feature: "widgets",
      owned_by: "widgets",
      fixtures: ["gadgetApi"],
      methods: [
        clientMethod("getById", {
          http_method: "get",
          path: "gadgets/{gadgetId}",
          path_params: [{ name: "gadgetId", type: "number" }]
        })
      ]
    });
    const result = expectWritten(await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client }));
    expect(result.filesWritten).toContain("clients/GadgetClient.ts");
  });

  it("C6 — accepts a client whose first method requires a body param", async () => {
    const { fs } = await seedWidgetsProject();
    const client = clientDef({
      client_class: "GadgetClient",
      feature: "widgets",
      owned_by: "widgets",
      fixtures: ["gadgetApi"],
      methods: [
        clientMethod("create", {
          http_method: "post",
          path: "gadgets",
          body_param: { name: "gadget", type: "Gadget" },
          body_type: "json"
        })
      ]
    });
    const result = expectWritten(await runApiGenerator(fs, { mode: "register_client", feature: "widgets", client }));
    expect(result.filesWritten).toContain("clients/GadgetClient.ts");
  });
});

describe("api-generator validate_api", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  it("D1 — returns no errors for a structurally valid schema scoped to its own feature", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = await runApiGenerator(fs, {
      mode: "validate_api",
      validateTarget: "create_api",
      feature: "widgets",
      schema: apiFullSchema()
    });
    expect("errors" in result && result.valid).toBe(true);
  });

  it("D2 — surfaces validation errors instead of throwing", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = await runApiGenerator(fs, {
      mode: "validate_api",
      validateTarget: "create_api",
      feature: "widgets",
      schema: apiFullSchema({ clients: [clientDef({ client_class: "WidgetClient", owned_by: "other-feature" })] })
    });
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "owned_by_mismatch")).toBe(true);
    }
  });

  it("D3 — rejects a validateTarget other than create_api", async () => {
    const { fs } = await createProjectRoot({ layer: "api" });
    const result = await runApiGenerator(fs, {
      mode: "validate_api",
      // @ts-expect-error -- exercising the runtime guard for an unsupported validateTarget
      validateTarget: "register_client",
      feature: "widgets"
    });
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.valid).toBe(false);
    }
  });
});
