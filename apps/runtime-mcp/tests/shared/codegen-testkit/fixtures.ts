import type {
  Action,
  Assertion,
  ElementDescriptor,
  FullSchema,
  PageDef,
  PersistedSchema,
  SpecDef,
  StepDef,
  TestCase,
  VerifyDef
} from "../../../src/codegen/schema.js";

export function el(
  ref: string,
  overrides: Partial<Omit<ElementDescriptor, "ref">> & { tag: string }
): ElementDescriptor {
  return { ref, ...overrides };
}

export function step(
  name: string,
  actions: Action[],
  overrides?: Partial<Omit<StepDef, "name" | "actions">>
): StepDef {
  return {
    jsdoc: "Perform the action",
    params: [],
    ...overrides,
    name,
    actions
  };
}

export function verify(
  name: string,
  assertions: Assertion[],
  overrides?: Partial<Omit<VerifyDef, "name" | "assertions">>
): VerifyDef {
  return {
    jsdoc: "Verify the outcome",
    params: [],
    ...overrides,
    name,
    assertions
  };
}

export function pageDef(
  overrides: Partial<PageDef> & Pick<PageDef, "page_class" | "feature">
): PageDef {
  return {
    owned_by: overrides.feature,
    path: "/login",
    elements: [],
    types: [],
    steps: [],
    verifies: [],
    ...overrides
  };
}

export function testCase(acId: string, overrides?: Partial<TestCase>): TestCase {
  return {
    scenario: "Happy Path",
    title: `[${acId}] should complete the flow`,
    body: [{ fixture: "loginPage", call: "step_navigate" }],
    ...overrides,
    ac_id: acId
  };
}

export function specDef(overrides?: Partial<SpecDef>): SpecDef {
  return {
    suite: "App - Login",
    generates_storage_state: null,
    storage_state: null,
    before_each: null,
    cases: [testCase("AC-1")],
    ...overrides
  };
}

export function fullSchema(overrides?: Partial<FullSchema>): FullSchema {
  const feature = "login";
  return {
    pages: [
      pageDef({
        feature,
        page_class: "LoginPage",
        owned_by: feature,
        elements: [
          el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
          el("submit", { tag: "button", testid: "submit", testid_attr: "data-testid" })
        ],
        steps: [
          step("step_navigate", [{ do: "navigate" }]),
          step("step_submit", [{ do: "click", ref: "submit" }])
        ],
        verifies: [
          verify("verify_loaded", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
        ]
      })
    ],
    spec: specDef(),
    ...overrides
  };
}

export function persistedSchema(overrides?: Partial<PersistedSchema>): PersistedSchema {
  return {
    ...fullSchema(overrides),
    _vindicate: {
      managed: true,
      schemaVersion: "1",
      notice: "DO NOT edit directly."
    },
    ...overrides
  };
}

export const PAGE_LOADER_TEMPLATE = `// ── Page Objects ─────────────────────────────────────────────

// ── Panels ───────────────────────────────────────────────────

// ── Test Data ────────────────────────────────────────────────
`;

export const PAGE_CONFIG_TEMPLATE = `import { test as base, expect } from '@playwright/test';

// grow_tests appends one import line per new page class above this comment.

const test = base.extend<{
  // fixture-types: grow_tests appends one type entry per feature below this line
}>({
  // fixture-impls: grow_tests appends one fixture entry per feature below this line
});

export { test, expect };
`;
