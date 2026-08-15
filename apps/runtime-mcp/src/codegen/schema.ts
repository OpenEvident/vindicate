import { z } from "zod";

import { StructuredLocatorSchema } from "@vindicate/protocol";

export const ParamSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1)
});
export type Param = z.infer<typeof ParamSchema>;

export const ElementDescriptorSchema = z.object({
  ref: z.string().min(1),
  tag: z.string().min(1),
  testid: z.string().optional(),
  testid_attr: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  /**
   * Marks a runtime-parameterized locator. When present, the element is rendered as a
   * locator METHOD taking these params (not a static field). Use `{paramName}` placeholders
   * inside testid/name/role (e.g. testid "delete-product-{id}"). Each placeholder must match
   * a declared param; actions/assertions referencing this ref must pass `refArgs`.
   */
  dynamic: z.array(ParamSchema).optional(),
  /**
   * The verified structured locator captured in `ground` (from a finalized recording or a live
   * `browser_read`). Codegen renders only this; agent-supplied locator fields are not trusted.
   * Optional on the schema so additive changes compile, but codegen fails closed when a static
   * element has no locator.
   */
  locator: StructuredLocatorSchema.optional()
});
export type ElementDescriptor = z.infer<typeof ElementDescriptorSchema>;

export const TypeFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1)
});

export const TypeDefSchema = z.object({
  name: z.string().min(1),
  fields: z.array(TypeFieldSchema)
});
export type TypeDef = z.infer<typeof TypeDefSchema>;

/**
 * Runtime args for a dynamic (parameterized) locator. Each entry is a TS expression string
 * pasted verbatim, supplying one of the element's `dynamic` params in order. Only valid when
 * the referenced element declares `dynamic`.
 */
const RefArgsSchema = z.array(z.string().min(1)).optional();

export const ActionSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("navigate") }),
  z.object({ do: z.literal("waitForPageLoad") }),
  z.object({ do: z.literal("waitForURL"), pattern: z.string().min(1) }),
  z.object({ do: z.literal("waitForResponse"), urlPattern: z.string().min(1) }),
  z.object({
    do: z.literal("fill"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    value: z.string().min(1).optional(),
    param: z.string().min(1).optional()
  }),
  /**
   * Types via real per-character key events (Playwright's `pressSequentially`), unlike `fill`, which
   * sets the DOM value directly. Some controlled-input components (React state driven off onKeyDown/
   * onInput rather than the native value setter, masked/formatted fields, etc.) never see `fill`'s
   * programmatic value change and silently stay empty — confirmed live on GrubCenter's product name
   * field. `browser_act`'s `type` action (interaction.handlers.ts `handleType`) already has this; codegen
   * had no way to render it, forcing a hand-edit outside the generated page object every time.
   */
  z.object({
    do: z.literal("type"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    value: z.string().min(1).optional(),
    param: z.string().min(1).optional(),
    clear_first: z.boolean().optional()
  }),
  z.object({ do: z.literal("click"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({
    do: z.literal("click_if_visible"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    timeout: z.number().int().positive().optional()
  }),
  z.object({ do: z.literal("hover"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({ do: z.literal("check"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({ do: z.literal("uncheck"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({
    do: z.literal("select"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    value: z.string().min(1).optional(),
    param: z.string().min(1).optional()
  }),
  z.object({ do: z.literal("press"), key: z.string().min(1) }),
  z.object({
    do: z.literal("upload"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    files: z.array(z.string().min(1)).min(1)
  }),
  z.object({ do: z.literal("dblclick"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({
    do: z.literal("drag"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    toRef: z.string().min(1),
    toRefArgs: RefArgsSchema,
    strategy: z.enum(["manual", "native"]).optional()
  }),
  z.object({ do: z.literal("scroll"), ref: z.string().min(1), refArgs: RefArgsSchema }),
  z.object({ do: z.literal("accept_dialog") }),
  z.object({ do: z.literal("dismiss_dialog") })
]);
export type Action = z.infer<typeof ActionSchema>;

export const VALID_ACTIONS = [
  "navigate",
  "waitForPageLoad",
  "waitForURL",
  "waitForResponse",
  "fill",
  "type",
  "click",
  "click_if_visible",
  "hover",
  "check",
  "uncheck",
  "select",
  "press",
  "upload",
  "dblclick",
  "drag",
  "scroll",
  "accept_dialog",
  "dismiss_dialog"
] as const;

export const SUPPORTED_MATCHERS = [
  "toBeVisible",
  "toBeHidden",
  "toBeDisabled",
  "toBeEnabled",
  "toBeChecked",
  "toContainText",
  "toHaveText",
  "toHaveValue",
  "toHaveCount",
  "toHaveAttribute",
  "toHaveClass",
  "toHaveURL",
  "toHaveTitle",
  "toHaveCSS",
  "toBeEmpty",
  "toBeFocused"
] as const;
export type SupportedMatcher = (typeof SUPPORTED_MATCHERS)[number];

export const AssertionSchema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal("page"),
    matcher: z.enum(SUPPORTED_MATCHERS),
    arg: z.string().optional()
  }),
  z.object({
    subject: z.literal("element"),
    ref: z.string().min(1),
    refArgs: RefArgsSchema,
    waitFor: z.enum(["visible", "hidden", "attached", "detached"]).optional(),
    matcher: z.enum(SUPPORTED_MATCHERS),
    arg: z.string().optional()
  })
]);
export type Assertion = z.infer<typeof AssertionSchema>;

export const StepDefSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^step_/, "Step names must start with 'step_'"),
  jsdoc: z.string().min(1),
  params: z.array(ParamSchema),
  actions: z.array(ActionSchema).min(1)
});
export type StepDef = z.infer<typeof StepDefSchema>;

export const VerifyDefSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^verify_/, "Verify names must start with 'verify_'"),
  jsdoc: z.string().min(1),
  params: z.array(ParamSchema),
  assertions: z.array(AssertionSchema).min(1)
});
export type VerifyDef = z.infer<typeof VerifyDefSchema>;

export const PageDefSchema = z.object({
  feature: z.string().min(1),
  page_class: z.string().min(1),
  path: z.string().optional(),
  owned_by: z.string().min(1),
  is_panel: z.boolean().optional(),
  elements: z.array(ElementDescriptorSchema),
  types: z.array(TypeDefSchema),
  steps: z.array(StepDefSchema),
  verifies: z.array(VerifyDefSchema)
});
export type PageDef = z.infer<typeof PageDefSchema>;

export const BodyCallSchema = z.object({
  fixture: z.string().min(1),
  call: z.string().min(1),
  args: z.array(z.string()).optional()
});
export type BodyCall = z.infer<typeof BodyCallSchema>;

export const TestCaseSchema = z.object({
  ac_id: z.string().min(1),
  scenario: z.string().min(1),
  title: z.string().min(1),
  annotation: z.enum(["fixme", "skip"]).optional(),
  body: z.array(BodyCallSchema).min(1)
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const SpecDefSchema = z.object({
  suite: z.string().min(1),
  generates_storage_state: z.string().nullable(),
  storage_state: z.string().nullable(),
  before_each: z.array(BodyCallSchema).nullable(),
  cases: z.array(TestCaseSchema).min(1)
});
export type SpecDef = z.infer<typeof SpecDefSchema>;

export const VindicateMetaSchema = z.object({
  managed: z.literal(true),
  schemaVersion: z.string().min(1),
  notice: z.string().optional()
});
export type VindicateMeta = z.infer<typeof VindicateMetaSchema>;

export const FullSchemaSchema = z.object({
  _vindicate: VindicateMetaSchema.optional(),
  pages: z.array(PageDefSchema).min(1),
  /**
   * URL path substrings observed during ground (e.g. from submit XHRs). Required when any step uses
   * `waitForResponse`; each `urlPattern` must match at least one entry (substring check, same as codegen).
   */
  observed_endpoints: z.array(z.string().min(1)).optional(),
  expected: z.record(z.string(), z.unknown()).optional(),
  spec: SpecDefSchema
});
export type FullSchema = z.infer<typeof FullSchemaSchema>;

export const PersistedSchemaSchema = FullSchemaSchema.extend({
  _vindicate: VindicateMetaSchema
});
export type PersistedSchema = z.infer<typeof PersistedSchemaSchema>;

export const AddTestCasesSchema = z.object({
  mode: z.literal("add_test_cases"),
  feature: z.string().min(1),
  cases: z.array(TestCaseSchema).min(1)
});

export const RegisterPageSchema = z.object({
  mode: z.literal("register_page"),
  feature: z.string().min(1),
  page: PageDefSchema
});

export const ValidateTargetSchema = z.literal("create");

export const ValidateModeSchema = z
  .object({
    mode: z.literal("validate"),
    validateTarget: ValidateTargetSchema,
    feature: z.string().min(1),
    schema: FullSchemaSchema.optional()
  })
  .superRefine((val, ctx) => {
    if (val.schema === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "schema is required for validateTarget 'create'",
        path: ["schema"]
      });
    }
  });

export type ValidateInput = z.infer<typeof ValidateModeSchema>;

export const CreateModeSchema = z.object({
  mode: z.literal("create"),
  feature: z.string().min(1),
  schema: FullSchemaSchema,
  overwrite: z.boolean().optional()
});

export const GenerateCodeInputSchema = z.discriminatedUnion("mode", [
  ValidateModeSchema,
  CreateModeSchema,
  AddTestCasesSchema,
  RegisterPageSchema
]);
export type GenerateCodeInput = z.infer<typeof GenerateCodeInputSchema>;
