import type {
  ApiAssertion,
  ApiCall,
  ApiFullSchema,
  ApiSpecDef,
  ApiTestCase,
  BuilderDef,
  ClientDef,
  ClientMethod
} from "../../../src/codegen/api-schema.js";

export function clientMethod(name: string, overrides?: Partial<ClientMethod>): ClientMethod {
  return {
    http_method: "get",
    path: name.toLowerCase(),
    supports_header_override: true,
    ...overrides,
    name
  };
}

function defaultFixtureName(clientClass: string): string {
  const resource = clientClass.endsWith("Client") ? clientClass.slice(0, -"Client".length) : clientClass;
  return `${resource.charAt(0).toLowerCase()}${resource.slice(1)}Api`;
}

export function clientDef(overrides: Partial<ClientDef> & Pick<ClientDef, "client_class">): ClientDef {
  const feature = overrides.feature ?? "widgets";
  return {
    feature,
    owned_by: feature,
    fixtures: [defaultFixtureName(overrides.client_class)],
    types: [],
    methods: [clientMethod("getAll")],
    ...overrides
  };
}

export function builderDef(overrides: Partial<BuilderDef> & Pick<BuilderDef, "builder_class" | "target_type">): BuilderDef {
  return {
    fields: [{ name: "name", type: "string", default: "'widget'" }],
    ...overrides
  };
}

export function apiCall(
  fixture: string,
  method: string,
  overrides?: Partial<Omit<ApiCall, "fixture" | "method">>
): ApiCall {
  const assertions: ApiAssertion[] = [{ subject: "status", matcher: "toBe", arg: "200" }];
  return {
    assertions,
    ...overrides,
    fixture,
    method
  };
}

export function apiTestCase(acId: string, overrides?: Partial<ApiTestCase>): ApiTestCase {
  return {
    scenario: "Happy Path",
    title: `[${acId}] should complete the flow`,
    calls: [apiCall("widgetApi", "getAll")],
    ...overrides,
    ac_id: acId
  };
}

export function apiSpecDef(overrides?: Partial<ApiSpecDef>): ApiSpecDef {
  return {
    suite: "App - Widgets",
    auth_setup: null,
    cases: [apiTestCase("AC-1")],
    ...overrides
  };
}

export function apiFullSchema(overrides?: Partial<ApiFullSchema>): ApiFullSchema {
  return {
    clients: [
      clientDef({
        feature: "widgets",
        client_class: "WidgetClient",
        owned_by: "widgets",
        fixtures: ["widgetApi"],
        methods: [
          clientMethod("getAll", { http_method: "get", path: "widgets" }),
          clientMethod("getById", {
            http_method: "get",
            path: "widgets/{widgetId}",
            path_params: [{ name: "widgetId", type: "number" }]
          })
        ]
      })
    ],
    spec: apiSpecDef(),
    ...overrides
  };
}

export const CLIENT_LOADER_TEMPLATE = `// ── Resource Clients ────────────────────────────────────────
`;

export const API_CONFIG_TEMPLATE = `import { test as base, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

// grow_tests appends one import line per new resource client above this comment.

const test = base.extend<{
  apiRequest: APIRequestContext;

  // fixture-types: grow_tests appends one type entry per feature below this line
}>({
  apiRequest: async ({}, use) => {
    const context = await playwrightRequest.newContext({
      baseURL: process.env.API_BASE_URL || process.env.BASE_URL,
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    await use(context);
    await context.dispose();
  },

  // fixture-impls: grow_tests appends one fixture entry per feature below this line
});

export { test, expect };
`;
