/**
 * @file Orchestrates the API codegen operations (create_api / add_api_test_cases /
 * register_client / validate_api) — the api-layer equivalent of generator.ts. Reuses generator.ts's
 * write/anchor/project-scoping plumbing (codegen-fs.ts) verbatim; only the client/builder/spec
 * content and the client-loader.ts/api.config.ts anchor wiring are API-specific.
 */
import type { ProjectFs } from "../fs/project-fs.js";
import { CodegenStructuralError, FileNotFoundError } from "../shared/errors.js";
import { assertNoValidationErrors } from "./assert-validation.js";
import { buildApiBuilder, buildApiClient } from "./api-client.js";
import type {
  ApiFullSchema,
  ApiTestCase,
  AuthSetup,
  BuilderDef,
  ClientDef,
  GenerateApiCodeInput
} from "./api-schema.js";
import { validateApiFullSchema } from "./api-validate-codegen.js";
import { appendApiTestCases, buildNewApiSpec } from "./api-spec-writer.js";
import {
  escapeRegExp,
  fileExists,
  flushWrites,
  insertAfterAnchor,
  insertBeforeAnchor,
  resolveEffectiveFs,
  type WriteEntry
} from "./codegen-fs.js";
import { runValidateApi } from "./validate-api-runner.js";
import type { CodegenRunResult, GeneratorResult } from "./generator.js";

const CLIENT_LOADER_ANCHOR = "// ── Resource Clients ────────────────────────────────────────";
const CONFIG_IMPORT_ANCHOR =
  "// grow_tests appends one import line per new resource client above this comment.";
const CONFIG_TYPE_ANCHOR = "// fixture-types: grow_tests appends one type entry per feature below this line";
const CONFIG_IMPL_ANCHOR = "// fixture-impls: grow_tests appends one fixture entry per feature below this line";

function clientPath(client: ClientDef): string {
  return `clients/${client.client_class}.ts`;
}

function builderPath(builder: BuilderDef): string {
  return `builders/${builder.builder_class}.ts`;
}

function isClientImportRegistered(content: string, clientClass: string): boolean {
  const pattern = new RegExp(`^import\\s*\\{\\s*${escapeRegExp(clientClass)}\\s*\\}\\s*from\\s*['"]\\./client-loader['"];`, "m");
  return pattern.test(content);
}

function isConfigFixtureRegistered(content: string, fixtureName: string): boolean {
  const pattern = new RegExp(`^\\s*${escapeRegExp(fixtureName)}:\\s*\\S`, "m");
  return pattern.test(content);
}

/** The client class an already-written fixture type entry (`  <fixture>: <Class>;`) is bound to,
 * if any. Used to distinguish "already registered by this same client, skip" (idempotent re-run)
 * from "already registered by a DIFFERENT client" (a real name collision) — the two cases the
 * naive existence-only check in {@link isConfigFixtureRegistered} can't tell apart. */
function registeredClientClassFor(content: string, fixtureName: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(fixtureName)}:\\s*(\\w+)\\s*;`, "m");
  return pattern.exec(content)?.[1];
}

/** Fails loud, before any file is written, when a client's fixture name is already bound to a
 * DIFFERENT client in api.config.ts — otherwise applyApiConfigUpdates silently skips the insert
 * (it reads as "already registered"), leaving the new client written to clients/ and exported from
 * client-loader.ts but with no usable fixture, while the old fixture keeps resolving to the old
 * client. Checked against the real file, not just within the incoming schema, since
 * duplicate_client_fixture only catches a collision between clients in the SAME create_api call. */
function assertNoFixtureCollision(existingApiConfigContent: string, clients: ClientDef[]): void {
  for (const client of clients) {
    for (const fixture of client.fixtures) {
      const existingClass = registeredClientClassFor(existingApiConfigContent, fixture);
      if (existingClass !== undefined && existingClass !== client.client_class) {
        throw new CodegenStructuralError(
          `Fixture '${fixture}' is already registered to client '${existingClass}' in api.config.ts.`,
          `Choose a different fixture name for '${client.client_class}' in fixtures[], or edit api.config.ts directly if rebinding '${fixture}' to '${client.client_class}' is intentional.`
        );
      }
    }
  }
}

function applyClientLoaderUpdates(content: string, clients: ClientDef[]): string {
  let current = content;
  for (const client of clients) {
    const exportLine = `export { ${client.client_class} } from '../../clients/${client.client_class}';`;
    if (current.includes(exportLine)) {
      continue;
    }
    current = insertAfterAnchor(current, CLIENT_LOADER_ANCHOR, exportLine);
  }
  return current;
}

/** Every fixture on `client` is wired to the plain `apiRequest` context — the only context the
 * schema can deterministically name (see ref-api-codegen-schema.md "Fixture naming"). A fixture
 * that needs a different context (e.g. the token-attached one from auth_setup) is a one-line
 * direct edit after generation. */
function clientFixtureImplLine(client: ClientDef, fixture: string): string {
  return `  ${fixture}: async ({ apiRequest }, use) => { await use(new ${client.client_class}(apiRequest)); },`;
}

function authSetupTypeEntries(): string {
  return ["  authApiRequest: APIRequestContext;", "  authToken: string;", "  authenticatedRequest: APIRequestContext;"].join(
    "\n"
  );
}

/** Uppercase, with every run of non-alphanumeric characters (hyphens, underscores) collapsed to a
 * single underscore — feature slugs are kebab-case-friendly elsewhere (UI's own featureCamel
 * exists specifically to handle this), so a raw `feature.toUpperCase()` would emit an invalid
 * env-var token for a hyphenated slug (`process.env.USER-PROFILE_USERNAME!` parses as subtraction,
 * not a valid identifier). */
function envVarToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function credentialEnvExpr(feature: string, paramName: string): string {
  return `process.env.${envVarToken(feature)}_${envVarToken(paramName)}!`;
}

function authSetupImplEntries(authSetup: AuthSetup, feature: string): string {
  const credentialFields = authSetup.credential_params
    .map((p) => `          ${p.name}: ${credentialEnvExpr(feature, p.name)},`)
    .join("\n");
  const headerValueExpr = authSetup.header_value_template.replace("{token}", "${authToken}");

  return [
    `  authApiRequest: [`,
    `    async ({}, use) => {`,
    `      const context = await playwrightRequest.newContext({`,
    `        baseURL: process.env.API_BASE_URL || process.env.BASE_URL,`,
    `        extraHTTPHeaders: { Accept: 'application/json' },`,
    `      });`,
    `      await use(context);`,
    `      await context.dispose();`,
    `    },`,
    `    { scope: 'worker' },`,
    `  ],`,
    ``,
    `  authToken: [`,
    `    async ({ authApiRequest }, use) => {`,
    `      const response = await authApiRequest.${authSetup.login_http_method}('${authSetup.login_path}', {`,
    `        data: {`,
    credentialFields,
    `        },`,
    `      });`,
    `      const body = await response.json();`,
    `      await use(body.${authSetup.token_field});`,
    `    },`,
    `    { scope: 'worker' },`,
    `  ],`,
    ``,
    `  authenticatedRequest: [`,
    `    async ({ authToken }, use) => {`,
    `      const context = await playwrightRequest.newContext({`,
    `        baseURL: process.env.API_BASE_URL || process.env.BASE_URL,`,
    `        extraHTTPHeaders: {`,
    `          Accept: 'application/json',`,
    `          '${authSetup.header_name}': \`${headerValueExpr}\`,`,
    `        },`,
    `      });`,
    `      await use(context);`,
    `      await context.dispose();`,
    `    },`,
    `    { scope: 'worker' },`,
    `  ],`
  ].join("\n");
}

function applyApiConfigUpdates(content: string, clients: ClientDef[], authSetup: AuthSetup | null, feature: string): string {
  let current = content;

  for (const client of clients) {
    if (!isClientImportRegistered(current, client.client_class)) {
      current = insertBeforeAnchor(current, CONFIG_IMPORT_ANCHOR, `import { ${client.client_class} } from './client-loader';`);
    }
    for (const fixture of client.fixtures) {
      if (isConfigFixtureRegistered(current, fixture)) {
        continue;
      }
      current = insertAfterAnchor(current, CONFIG_TYPE_ANCHOR, `  ${fixture}: ${client.client_class};`);
      current = insertAfterAnchor(current, CONFIG_IMPL_ANCHOR, clientFixtureImplLine(client, fixture));
    }
  }

  if (authSetup !== null && !isConfigFixtureRegistered(current, "authApiRequest")) {
    current = insertAfterAnchor(current, CONFIG_TYPE_ANCHOR, authSetupTypeEntries());
    current = insertAfterAnchor(current, CONFIG_IMPL_ANCHOR, authSetupImplEntries(authSetup, feature));
  }

  return current;
}

function runStructuralChecks(schema: ApiFullSchema, options?: { feature?: string }): void {
  assertNoValidationErrors(validateApiFullSchema(schema, options?.feature));
}

async function assertCreateApiNotClobbered(
  fs: ProjectFs,
  feature: string,
  schema: ApiFullSchema,
  overwrite?: boolean
): Promise<void> {
  if (overwrite === true) {
    return;
  }

  if (await fileExists(fs, `tests/${feature}.api.spec.ts`)) {
    throw new CodegenStructuralError(
      `Feature spec already exists: 'tests/${feature}.api.spec.ts'`,
      "Use overwrite:true to regenerate from scratch, or edit the existing spec directly."
    );
  }

  for (const client of schema.clients) {
    const path = clientPath(client);
    if (await fileExists(fs, path)) {
      throw new CodegenStructuralError(
        `Client already exists: '${path}'`,
        "Use overwrite:true to regenerate from scratch, or edit the existing client directly."
      );
    }
  }

  for (const builder of schema.builders ?? []) {
    const path = builderPath(builder);
    if (await fileExists(fs, path)) {
      throw new CodegenStructuralError(
        `Builder already exists: '${path}'`,
        "Use overwrite:true to regenerate from scratch, or edit the existing builder directly."
      );
    }
  }
}

async function runCreateApi(
  fs: ProjectFs,
  feature: string,
  schema: ApiFullSchema,
  overwrite?: boolean
): Promise<GeneratorResult> {
  runStructuralChecks(schema, { feature });
  await assertCreateApiNotClobbered(fs, feature, schema, overwrite);

  const writes: WriteEntry[] = [];

  for (const client of schema.clients) {
    writes.push({ path: clientPath(client), content: buildApiClient(client) });
  }
  for (const builder of schema.builders ?? []) {
    writes.push({ path: builderPath(builder), content: buildApiBuilder(builder) });
  }

  const clientLoaderContent = await fs.read("support/config/client-loader.ts");
  writes.push({
    path: "support/config/client-loader.ts",
    content: applyClientLoaderUpdates(clientLoaderContent, schema.clients)
  });

  const apiConfigContent = await fs.read("support/config/api.config.ts");
  assertNoFixtureCollision(apiConfigContent, schema.clients);
  writes.push({
    path: "support/config/api.config.ts",
    content: applyApiConfigUpdates(apiConfigContent, schema.clients, schema.spec.auth_setup, feature)
  });

  writes.push({ path: `tests/${feature}.api.spec.ts`, content: buildNewApiSpec(schema, feature) });

  if (schema.expected !== undefined && Object.keys(schema.expected).length > 0) {
    writes.push({
      path: `support/data/${feature}/expected.json`,
      content: `${JSON.stringify(schema.expected, null, 2)}\n`
    });
  }

  return { filesWritten: await flushWrites(fs, writes) };
}

async function runAddApiTestCases(fs: ProjectFs, feature: string, cases: ApiTestCase[]): Promise<GeneratorResult> {
  let existingSpec: string;
  try {
    existingSpec = await fs.read(`tests/${feature}.api.spec.ts`);
  } catch (err: unknown) {
    if (err instanceof FileNotFoundError) {
      throw new CodegenStructuralError(
        `Spec file not found: 'tests/${feature}.api.spec.ts'`,
        "Run mode:'create_api' first to create the feature spec."
      );
    }
    throw err;
  }

  const newSpecContent = appendApiTestCases(existingSpec, cases);

  return {
    filesWritten: await flushWrites(fs, [{ path: `tests/${feature}.api.spec.ts`, content: newSpecContent }])
  };
}

function validateRegisterClient(client: ClientDef, feature: string): void {
  if (client.owned_by !== feature) {
    throw new CodegenStructuralError(
      `Client owned_by '${client.owned_by}' does not match feature '${feature}'`,
      "Set client.owned_by to the feature slug (e.g. 'posts'), not the fixture name."
    );
  }

  const firstFixture = client.fixtures[0];
  const firstMethod = client.methods[0];
  if (firstFixture === undefined || firstMethod === undefined) {
    throw new CodegenStructuralError(
      `Client '${client.client_class}' must define at least one fixture and one method`,
      "Add fixtures and methods to the client definition before register_client."
    );
  }

  // Dummy args matching firstMethod's real param count (path_params then body_param) — otherwise
  // any client whose first method takes params would always fail client_method_arg_count here,
  // even though register_client isn't actually validating a real call.
  const dummyArgs = [...(firstMethod.path_params ?? []).map(() => "1"), ...(firstMethod.body_param !== undefined ? ["{}"] : [])];

  const syntheticSchema: ApiFullSchema = {
    clients: [client],
    spec: {
      suite: "Validate",
      auth_setup: null,
      cases: [
        {
          ac_id: "AC-0",
          scenario: "Validate",
          title: "[AC-0] validate",
          calls: [
            {
              fixture: firstFixture,
              method: firstMethod.name,
              args: dummyArgs,
              assertions: [{ subject: "status", matcher: "toBeDefined" }]
            }
          ]
        }
      ]
    }
  };
  runStructuralChecks(syntheticSchema, { feature });
}

async function runRegisterClient(fs: ProjectFs, feature: string, client: ClientDef): Promise<GeneratorResult> {
  validateRegisterClient(client, feature);

  const targetPath = clientPath(client);
  if (await fileExists(fs, targetPath)) {
    throw new CodegenStructuralError(
      `Client already exists: '${targetPath}'`,
      "Edit the existing client directly, or delete it before register_client."
    );
  }

  const clientLoaderContent = await fs.read("support/config/client-loader.ts");
  const apiConfigContent = await fs.read("support/config/api.config.ts");
  assertNoFixtureCollision(apiConfigContent, [client]);

  return {
    filesWritten: await flushWrites(fs, [
      { path: targetPath, content: buildApiClient(client) },
      {
        path: "support/config/client-loader.ts",
        content: applyClientLoaderUpdates(clientLoaderContent, [client])
      },
      {
        path: "support/config/api.config.ts",
        content: applyApiConfigUpdates(apiConfigContent, [client], null, feature)
      }
    ])
  };
}

export async function runApiGenerator(
  fs: ProjectFs,
  input: GenerateApiCodeInput,
  pathGuard?: (relativePath: string) => Promise<void>
): Promise<CodegenRunResult> {
  if (input.mode === "validate_api") {
    return runValidateApi(fs, input);
  }
  const effectiveFs = await resolveEffectiveFs(fs, pathGuard);
  switch (input.mode) {
    case "create_api":
      return runCreateApi(effectiveFs, input.feature, input.schema, input.overwrite);
    case "add_api_test_cases":
      return runAddApiTestCases(effectiveFs, input.feature, input.cases);
    case "register_client":
      return runRegisterClient(effectiveFs, input.feature, input.client);
  }
}
