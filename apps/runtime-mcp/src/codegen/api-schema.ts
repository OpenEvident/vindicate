/**
 * @file Canonical input shape for API-layer codegen — the API equivalent of schema.ts, generating
 * resource clients/builders/fixtures/specs (content/templates/api/) instead of page objects.
 *
 * Mirrors schema.ts's shape wherever the concept genuinely carries over (Param, TypeDef,
 * VindicateMeta, BodyCall) — imported directly, not duplicated. Diverges where the generated code
 * itself diverges: a client method is one HTTP call, not a multi-action step; assertions are
 * inline in the spec body (matching the fixed `vindicate-api` template convention — "what's being
 * checked is visible without a detour through a helper"), not routed through `verify_*` methods.
 */
import { z } from "zod";

import { VindicateMetaSchema, ParamSchema, TypeDefSchema } from "./schema.js";

export const API_HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head"] as const;
export type ApiHttpMethod = (typeof API_HTTP_METHODS)[number];

export const API_BODY_TYPES = ["json", "form", "multipart"] as const;
export type ApiBodyType = (typeof API_BODY_TYPES)[number];

/**
 * One resource-client method — one HTTP call. `path` may carry `{param}` placeholders (mirrors
 * ElementDescriptor's `dynamic` locator placeholders); every placeholder must have a matching
 * entry in `path_params` and vice versa.
 */
export const ClientMethodSchema = z
  .object({
    name: z.string().min(1),
    jsdoc: z.string().optional(),
    http_method: z.enum(API_HTTP_METHODS),
    path: z.string().min(1),
    path_params: z.array(ParamSchema).optional(),
    body_param: ParamSchema.optional(),
    body_type: z.enum(API_BODY_TYPES).optional(),
    /** Rendered as an optional trailing `headers?: Record<string, string>` param on every method
     * (the per-call override convention every generated client method carries) — not user-set. */
    supports_header_override: z.boolean().default(true)
  })
  .refine((m) => !(m.body_param !== undefined && m.body_type === undefined), {
    message: "body_type is required when body_param is present",
    path: ["body_type"]
  })
  .refine((m) => !(m.body_param === undefined && m.body_type !== undefined), {
    message: "body_param is required when body_type is present",
    path: ["body_param"]
  });
export type ClientMethod = z.infer<typeof ClientMethodSchema>;

export const ClientDefSchema = z.object({
  feature: z.string().min(1),
  client_class: z.string().min(1),
  owned_by: z.string().min(1),
  /** Fixture key(s) `ApiCall.fixture` resolves against — explicit, not derived, because the
   * mapping isn't always 1:1 mechanical camelCase(client_class): the fixed `vindicate-api` template's
   * AuthClient binds two fixtures (`authClient` unauthenticated, `authenticatedClient` carrying the
   * token-once header) to the same client class. Usually one entry (e.g. `PostClient` → `postApi`). */
  fixtures: z.array(z.string().min(1)).min(1),
  types: z.array(TypeDefSchema),
  methods: z.array(ClientMethodSchema).min(1)
});
export type ClientDef = z.infer<typeof ClientDefSchema>;

/** One field of a payload builder's fluent `.withX()` chain. `default` is a TS expression string
 * pasted verbatim (mirrors BodyCall.args), giving the builder's `defaultPayload` a sensible value
 * when a test doesn't override that field. */
export const BuilderFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  default: z.string().min(1)
});
export type BuilderField = z.infer<typeof BuilderFieldSchema>;

export const BuilderDefSchema = z.object({
  builder_class: z.string().min(1),
  target_type: z.string().min(1),
  /** The client_class whose types[] declares target_type, so the generated builder can import it
   * (client types render inline in the client's own file — see ClientDef.types — so there's
   * nowhere else to import from). Omit only when target_type is a primitive or an inline object
   * literal type, which needs no import. */
  owning_client: z.string().min(1).optional(),
  fields: z.array(BuilderFieldSchema).min(1)
});
export type BuilderDef = z.infer<typeof BuilderDefSchema>;

/**
 * Token-once auth: log in once per worker, share the token across every authenticated call — the
 * API equivalent of UI's storage-state `auth.setup.ts`. `token_field` is a dot-path into the login
 * response JSON (e.g. "accessToken"); `header_value_template` must contain exactly one `{token}`
 * placeholder.
 */
export const AuthSetupSchema = z.object({
  login_http_method: z.enum(API_HTTP_METHODS),
  login_path: z.string().min(1),
  credential_params: z.array(ParamSchema).min(1),
  token_field: z.string().min(1),
  header_name: z.string().min(1).default("Authorization"),
  header_value_template: z
    .string()
    .min(1)
    .regex(/\{token\}/, "must contain a {token} placeholder")
    .default("Bearer {token}")
});
export type AuthSetup = z.infer<typeof AuthSetupSchema>;

export const API_ASSERTION_MATCHERS = [
  "toBe",
  "toEqual",
  "toMatchObject",
  "toContain",
  "toContainEqual",
  "toBeGreaterThan",
  "toBeLessThan",
  "toBeDefined",
  "toBeUndefined",
  "toBeNull"
] as const;
export type ApiAssertionMatcher = (typeof API_ASSERTION_MATCHERS)[number];

export const API_ASSERTION_SUBJECTS = [
  "status",
  "status_text",
  "body",
  "body_json",
  "header"
] as const;
export type ApiAssertionSubject = (typeof API_ASSERTION_SUBJECTS)[number];

export const ApiAssertionSchema = z
  .object({
    subject: z.enum(API_ASSERTION_SUBJECTS),
    header_name: z.string().min(1).optional(),
    matcher: z.enum(API_ASSERTION_MATCHERS),
    /** TS expression string pasted verbatim into the generated expect(...) call — same convention
     * as Assertion.arg / BodyCall.args in schema.ts. Omitted only for toBeDefined/toBeUndefined/toBeNull. */
    arg: z.string().min(1).optional()
  })
  .refine((a) => a.subject !== "header" || a.header_name !== undefined, {
    message: "header_name is required when subject is 'header'",
    path: ["header_name"]
  })
  .refine(
    (a) => !["toBeDefined", "toBeUndefined", "toBeNull"].includes(a.matcher) || a.arg === undefined,
    { message: "arg must be omitted for toBeDefined/toBeUndefined/toBeNull", path: ["arg"] }
  )
  .refine(
    (a) => ["toBeDefined", "toBeUndefined", "toBeNull"].includes(a.matcher) || a.arg !== undefined,
    { message: "arg is required for this matcher", path: ["arg"] }
  );
export type ApiAssertion = z.infer<typeof ApiAssertionSchema>;

/** Captures a call's JSON response body (or one field of it) into a real local variable named
 * `as`, so a LATER call in the same test case can reference it in `args`/assertion `arg` — the
 * only way to express "create X, then use X's returned id": calls have no automatic semantic
 * variable name a later call could rely on, they're numbered response/response2/... positionally. */
export const ApiCaptureSchema = z.object({
  as: z.string().min(1),
  /** Dot-path into the parsed JSON body (e.g. "id"). Omit to capture the whole parsed body. */
  field: z.string().min(1).optional()
});
export type ApiCapture = z.infer<typeof ApiCaptureSchema>;

/** One client-method call plus its inline assertions — assertions render directly in the spec
 * body (`expect(response.status()).toBe(201)`), never through a verify_*-style indirection,
 * matching the fixed `vindicate-api` template's own convention. */
export const ApiCallSchema = z.object({
  fixture: z.string().min(1),
  method: z.string().min(1),
  args: z.array(z.string()).optional(),
  capture: ApiCaptureSchema.optional(),
  assertions: z.array(ApiAssertionSchema).min(1)
});
export type ApiCall = z.infer<typeof ApiCallSchema>;

export const ApiTestCaseSchema = z.object({
  ac_id: z.string().min(1),
  scenario: z.string().min(1),
  title: z.string().min(1),
  annotation: z.enum(["fixme", "skip"]).optional(),
  calls: z.array(ApiCallSchema).min(1)
});
export type ApiTestCase = z.infer<typeof ApiTestCaseSchema>;

export const ApiSpecDefSchema = z.object({
  suite: z.string().min(1),
  auth_setup: AuthSetupSchema.nullable(),
  cases: z.array(ApiTestCaseSchema).min(1)
});
export type ApiSpecDef = z.infer<typeof ApiSpecDefSchema>;

export const ApiFullSchemaSchema = z.object({
  _vindicate: VindicateMetaSchema.optional(),
  clients: z.array(ClientDefSchema).min(1),
  builders: z.array(BuilderDefSchema).optional(),
  /** Fixed/negative-path test data — support/data/<feature>/expected.json, referenced as
   * `expected.key` in ApiCall.args / ApiAssertion.arg. Same convention as schema.ts's `expected`. */
  expected: z.record(z.string(), z.unknown()).optional(),
  spec: ApiSpecDefSchema
});
export type ApiFullSchema = z.infer<typeof ApiFullSchemaSchema>;

export const ApiPersistedSchemaSchema = ApiFullSchemaSchema.extend({
  _vindicate: VindicateMetaSchema
});
export type ApiPersistedSchema = z.infer<typeof ApiPersistedSchemaSchema>;

// ── Operations — mirror create/add_test_cases/register_page/validate, distinct literal mode
// values so they can share the same vindicate_generate_code tool surface as the UI ops without any
// ambiguity (each `mode` string is globally unique across both schemas). ──────────────────────────

export const ApiAddTestCasesSchema = z.object({
  mode: z.literal("add_api_test_cases"),
  feature: z.string().min(1),
  cases: z.array(ApiTestCaseSchema).min(1)
});

export const RegisterClientSchema = z.object({
  mode: z.literal("register_client"),
  feature: z.string().min(1),
  client: ClientDefSchema
});

export const ApiValidateTargetSchema = z.literal("create_api");

export const ApiValidateModeSchema = z
  .object({
    mode: z.literal("validate_api"),
    validateTarget: ApiValidateTargetSchema,
    feature: z.string().min(1),
    schema: ApiFullSchemaSchema.optional()
  })
  .superRefine((val, ctx) => {
    if (val.schema === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "schema is required for validateTarget 'create_api'",
        path: ["schema"]
      });
    }
  });
export type ApiValidateInput = z.infer<typeof ApiValidateModeSchema>;

export const CreateApiSchema = z.object({
  mode: z.literal("create_api"),
  feature: z.string().min(1),
  schema: ApiFullSchemaSchema,
  overwrite: z.boolean().optional()
});

export const GenerateApiCodeInputSchema = z.discriminatedUnion("mode", [
  ApiValidateModeSchema,
  CreateApiSchema,
  ApiAddTestCasesSchema,
  RegisterClientSchema
]);
export type GenerateApiCodeInput = z.infer<typeof GenerateApiCodeInputSchema>;

// Re-exported so consumers of api-schema.ts don't also need to import from schema.ts directly
// for the primitives this file builds on.
export { VindicateMetaSchema, ParamSchema, TypeDefSchema };
