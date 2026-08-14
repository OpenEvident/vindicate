import { describe, expect, it } from "vitest";

import type { ApiCall, ApiFullSchema } from "../../../src/codegen/api-schema.js";
import { ApiFullSchemaSchema } from "../../../src/codegen/api-schema.js";
import {
  collectApiBuilderErrors,
  collectApiCrossReferenceErrors,
  collectApiStructuralErrors,
  validateApiFullSchema
} from "../../../src/codegen/api-validate-codegen.js";

// Real-shape worked example — the same fixed vindicate-api template shape proven parseable in
// api-schema.test.ts (PostClient create/getAll/getById/update/delete + dummyjson.com AuthClient).
function baseSchema(): ApiFullSchema {
  return ApiFullSchemaSchema.parse({
    clients: [
      {
        feature: "posts",
        client_class: "PostClient",
        owned_by: "posts",
        fixtures: ["postApi"],
        types: [
          {
            name: "Post",
            fields: [
              { name: "id", type: "number" },
              { name: "userId", type: "number" },
              { name: "title", type: "string" },
              { name: "body", type: "string" }
            ]
          }
        ],
        methods: [
          {
            name: "create",
            http_method: "post",
            path: "posts",
            body_param: { name: "post", type: "Post" },
            body_type: "json"
          },
          { name: "getAll", http_method: "get", path: "posts" },
          {
            name: "getById",
            http_method: "get",
            path: "posts/{postId}",
            path_params: [{ name: "postId", type: "number" }]
          },
          {
            name: "update",
            http_method: "put",
            path: "posts/{postId}",
            path_params: [{ name: "postId", type: "number" }],
            body_param: { name: "post", type: "Partial<Post>" },
            body_type: "json"
          },
          {
            name: "delete",
            http_method: "delete",
            path: "posts/{postId}",
            path_params: [{ name: "postId", type: "number" }]
          }
        ]
      },
      {
        feature: "auth",
        client_class: "AuthClient",
        owned_by: "auth",
        fixtures: ["authClient", "authenticatedClient"],
        types: [],
        methods: [
          {
            name: "login",
            http_method: "post",
            path: "auth/login",
            body_param: { name: "credentials", type: "{ username: string; password: string }" },
            body_type: "json"
          },
          { name: "me", http_method: "get", path: "auth/me" }
        ]
      }
    ],
    builders: [
      {
        builder_class: "PostPayloadBuilder",
        target_type: "Post",
        fields: [
          { name: "title", type: "string", default: "'Playwright API test'" },
          { name: "body", type: "string", default: "'Automated with Playwright request context'" },
          { name: "userId", type: "number", default: "1" }
        ]
      }
    ],
    expected: {
      nonExistentPostId: 999999999,
      invalidPassword: "wrongpassword",
      invalidCredentialsMessage: "Invalid credentials"
    },
    spec: {
      suite: "Acme - Posts",
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
      cases: [
        {
          ac_id: "AC-1",
          scenario: "Create Post",
          title: "[AC-1] should create a new post",
          calls: [
            {
              fixture: "postApi",
              method: "create",
              args: ["{ title: 'hello', body: 'world', userId: 1 }"],
              assertions: [
                { subject: "status", matcher: "toBe", arg: "201" },
                { subject: "body_json", matcher: "toMatchObject", arg: "{ title: 'hello', body: 'world', userId: 1 }" }
              ]
            }
          ]
        },
        {
          ac_id: "AC-6",
          scenario: "Not Found",
          title: "[AC-6] should return 404 for a post that does not exist",
          calls: [
            {
              fixture: "postApi",
              method: "getById",
              args: ["expected.nonExistentPostId"],
              assertions: [{ subject: "status", matcher: "toBe", arg: "404" }]
            }
          ]
        }
      ]
    }
  });
}

function firstCall(schema: ApiFullSchema): ApiCall {
  return schema.spec.cases[0]!.calls[0]!;
}

describe("api-validate-codegen", () => {
  describe("validateApiFullSchema — known-good schema", () => {
    it("accepts the real-shape worked example with zero errors (no feature scoping)", () => {
      const errors = validateApiFullSchema(baseSchema());
      expect(errors).toEqual([]);
    });

    it("flags owned_by_mismatch when scoped to a feature the AuthClient companion doesn't belong to", () => {
      // The real vindicate-api template's PostClient (jsonplaceholder) and AuthClient (dummyjson) are
      // two independent, unrelated demo resources living in one project — not one feature's own
      // auth. Scoping validation to create_api feature "posts" correctly flags AuthClient's
      // owned_by "auth" as a mismatch: bundling an unrelated feature's client into this create_api
      // call is the bug this check exists to catch (mirrors the UI validator's own, proven
      // one-feature-per-create invariant). A feature that genuinely owns its own auth endpoint
      // would set that client's owned_by to match; a shared/cross-cutting auth client belongs in
      // its own create_api call, referenced afterwards by fixture only (like UI's page reuse).
      const errors = validateApiFullSchema(baseSchema(), "posts");
      expect(errors).toEqual([
        expect.objectContaining({ code: "owned_by_mismatch", path: "clients[1].owned_by" })
      ]);
    });
  });

  describe("collectApiStructuralErrors", () => {
    it("detects a duplicate client_class", () => {
      const schema = baseSchema();
      const errors = collectApiStructuralErrors({
        ...schema,
        clients: [schema.clients[0]!, { ...schema.clients[0]! }]
      });
      expect(errors.some((e) => e.code === "duplicate_client_class")).toBe(true);
    });

    it("detects a fixture name declared on two different clients", () => {
      const schema = baseSchema();
      const [postClient, authClient] = schema.clients;
      const errors = collectApiStructuralErrors({
        ...schema,
        clients: [postClient!, { ...authClient!, fixtures: ["postApi"] }]
      });
      expect(errors.some((e) => e.code === "duplicate_client_fixture")).toBe(true);
    });

    it("detects a duplicate method name on one client", () => {
      const schema = baseSchema();
      const client = schema.clients[0]!;
      const errors = collectApiStructuralErrors({
        ...schema,
        clients: [{ ...client, methods: [...client.methods, { ...client.methods[0]! }] }]
      });
      expect(errors.some((e) => e.code === "duplicate_client_method_name")).toBe(true);
    });

    it("flags an owned_by mismatch against the create_api feature", () => {
      const schema = baseSchema();
      const errors = collectApiStructuralErrors(schema, { feature: "not-posts" });
      expect(errors.some((e) => e.code === "owned_by_mismatch")).toBe(true);
    });

    it("does not flag owned_by when no feature is given", () => {
      const schema = baseSchema();
      const errors = collectApiStructuralErrors(schema);
      expect(errors.some((e) => e.code === "owned_by_mismatch")).toBe(false);
    });

    it("detects a path placeholder with no matching path_params entry", () => {
      const schema = baseSchema();
      const client = schema.clients[0]!;
      const errors = collectApiStructuralErrors({
        ...schema,
        clients: [
          {
            ...client,
            methods: [
              ...client.methods,
              { name: "getByOwner", http_method: "get", path: "posts/{postId}/owner", supports_header_override: true }
            ]
          }
        ]
      });
      expect(errors.some((e) => e.code === "path_param_placeholder_mismatch")).toBe(true);
    });

    it("detects a declared path_param unused in the path", () => {
      const schema = baseSchema();
      const client = schema.clients[0]!;
      const errors = collectApiStructuralErrors({
        ...schema,
        clients: [
          {
            ...client,
            methods: [
              ...client.methods,
              {
                name: "listAll",
                http_method: "get",
                path: "posts",
                path_params: [{ name: "unused", type: "string" }],
                supports_header_override: true
              }
            ]
          }
        ]
      });
      expect(errors.some((e) => e.code === "path_param_placeholder_mismatch")).toBe(true);
    });
  });

  describe("collectApiCrossReferenceErrors", () => {
    it("detects an unknown client fixture", () => {
      const schema = baseSchema();
      firstCall(schema).fixture = "ghostApi";
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "unknown_client_fixture")).toBe(true);
    });

    it("detects an unknown method on a known client", () => {
      const schema = baseSchema();
      firstCall(schema).method = "archive";
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "unknown_client_method")).toBe(true);
    });

    it("detects too few args for the method's params", () => {
      const schema = baseSchema();
      // getById requires 1 arg (postId path param); AC-6's call supplies exactly one — drop it.
      const getByIdCall = schema.spec.cases[1]!.calls[0]!;
      getByIdCall.args = [];
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "client_method_arg_count")).toBe(true);
    });

    it("detects too many args for the method's params", () => {
      const schema = baseSchema();
      const getByIdCall = schema.spec.cases[1]!.calls[0]!;
      getByIdCall.args = ["expected.nonExistentPostId", "'extra'"];
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "client_method_arg_count")).toBe(true);
    });

    it("detects an invalid TS expression in a call arg", () => {
      const schema = baseSchema();
      firstCall(schema).args = ["{ title: 'unterminated"];
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "invalid_api_call_arg")).toBe(true);
    });

    it("detects a quoted process.env literal in a call arg", () => {
      const schema = baseSchema();
      firstCall(schema).args = ['"process.env.AUTH_EMAIL"'];
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "quoted_env_var_arg")).toBe(true);
    });

    it("detects an invalid TS expression in an assertion arg", () => {
      const schema = baseSchema();
      firstCall(schema).assertions[0]!.arg = "{ unterminated";
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "invalid_assertion_arg")).toBe(true);
    });

    it("detects a duplicate ac_id across spec.cases", () => {
      const schema = baseSchema();
      schema.spec.cases[1]!.ac_id = schema.spec.cases[0]!.ac_id;
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "duplicate_ac_id")).toBe(true);
    });
  });

  describe("expected-data checks", () => {
    it("flags a reference to an expected key that doesn't exist", () => {
      const schema = baseSchema();
      firstCall(schema).args = ["expected.doesNotExist"];
      const errors = validateApiFullSchema(schema);
      expect(errors.some((e) => e.code === "unknown_expected_key")).toBe(true);
    });

    it("flags a reference to expected.* when the schema has no expected block", () => {
      const schema = baseSchema();
      delete schema.expected;
      firstCall(schema).args = ["expected.nonExistentPostId"];
      const errors = validateApiFullSchema(schema);
      expect(errors.some((e) => e.code === "expected_block_missing")).toBe(true);
    });

    it("flags an empty expected block", () => {
      const schema = baseSchema();
      schema.expected = {};
      const errors = validateApiFullSchema(schema);
      expect(errors.some((e) => e.code === "empty_expected_block")).toBe(true);
    });

    it("flags duplicate string values across expected keys", () => {
      const schema = baseSchema();
      schema.expected = { ...schema.expected, duplicateOfInvalidPassword: "wrongpassword" };
      const errors = validateApiFullSchema(schema);
      expect(errors.some((e) => e.code === "duplicate_expected_value")).toBe(true);
    });
  });

  describe("collectApiBuilderErrors", () => {
    it("flags a string-typed default that is a bare, unquoted identifier (the reported VindicateTestPet bug)", () => {
      const schema = baseSchema();
      schema.builders![0]!.fields[0]!.default = "VindicateTestPet";
      const errors = collectApiBuilderErrors(schema);
      expect(errors).toEqual([
        expect.objectContaining({
          code: "unquoted_string_builder_default",
          path: "builders[0].fields[0].default"
        })
      ]);
    });

    it("accepts a quoted string default and a template literal default", () => {
      const schema = baseSchema();
      schema.builders![0]!.fields[0]!.default = "'quoted'";
      schema.builders![0]!.fields[1]!.default = "`templated ${1}`";
      const errors = collectApiBuilderErrors(schema);
      expect(errors).toEqual([]);
    });

    it("does not flag a legitimate unquoted process.env.X! or expected.key string default", () => {
      const schema = baseSchema();
      schema.builders![0]!.fields[0]!.default = "process.env.API_KEY!";
      schema.builders![0]!.fields[1]!.default = "expected.invalidPassword";
      const errors = collectApiBuilderErrors(schema);
      expect(errors.some((e) => e.code === "unquoted_string_builder_default")).toBe(false);
    });

    it("does not flag a non-string-typed field left unquoted", () => {
      const schema = baseSchema();
      // userId is type "number" with default "1" — unquoted is correct here.
      const errors = collectApiBuilderErrors(schema);
      expect(errors.some((e) => e.code === "unquoted_string_builder_default")).toBe(false);
    });

    it("flags a syntactically invalid default expression", () => {
      const schema = baseSchema();
      schema.builders![0]!.fields[0]!.default = "{ unterminated";
      const errors = collectApiBuilderErrors(schema);
      expect(errors.some((e) => e.code === "invalid_builder_default")).toBe(true);
    });
  });

  describe("leading-slash path rejection", () => {
    it("flags a client method path starting with '/' (the Petstore baseURL-joining trap)", () => {
      const schema = baseSchema();
      schema.clients[0]!.methods[0]!.path = "/posts";
      const errors = collectApiStructuralErrors(schema);
      expect(errors.some((e) => e.code === "leading_slash_path")).toBe(true);
    });

    it("does not flag a relative path", () => {
      const schema = baseSchema();
      const errors = collectApiStructuralErrors(schema);
      expect(errors.some((e) => e.code === "leading_slash_path")).toBe(false);
    });
  });

  describe("capture", () => {
    it("accepts a call with capture.as referencing a valid, non-colliding name", () => {
      const schema = baseSchema();
      firstCall(schema).capture = { as: "createdPost", field: "id" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "duplicate_capture_name" || e.code === "invalid_capture_name")).toBe(
        false
      );
    });

    it("flags capture.as colliding with the auto-generated response variable name in a multi-call case", () => {
      const schema = baseSchema();
      const secondCall: ApiCall = {
        fixture: "postApi",
        method: "getById",
        args: ["expected.nonExistentPostId"],
        assertions: [{ subject: "status", matcher: "toBe", arg: "404" }]
      };
      schema.spec.cases[0]!.calls = [firstCall(schema), secondCall];
      firstCall(schema).capture = { as: "response2" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "duplicate_capture_name")).toBe(true);
    });

    it("flags two captures in the same case using the same name", () => {
      const schema = baseSchema();
      const secondCall: ApiCall = {
        fixture: "postApi",
        method: "getById",
        args: ["expected.nonExistentPostId"],
        assertions: [{ subject: "status", matcher: "toBe", arg: "404" }],
        capture: { as: "shared" }
      };
      schema.spec.cases[0]!.calls = [{ ...firstCall(schema), capture: { as: "shared" } }, secondCall];
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "duplicate_capture_name")).toBe(true);
    });

    it("flags capture.as that isn't a valid identifier", () => {
      const schema = baseSchema();
      firstCall(schema).capture = { as: "123-not-valid" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "invalid_capture_name")).toBe(true);
    });

    it("flags capture.field: 'body_json' (the reported real-world mistake — response.json() has no .body_json)", () => {
      const schema = baseSchema();
      firstCall(schema).capture = { as: "createdPost", field: "body_json" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors).toContainEqual(
        expect.objectContaining({ code: "ambiguous_capture_field", path: "spec.cases[0].calls[0].capture.field" })
      );
    });

    it("flags capture.field: 'status_text' the same way", () => {
      const schema = baseSchema();
      firstCall(schema).capture = { as: "createdPost", field: "status_text" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "ambiguous_capture_field")).toBe(true);
    });

    it("does not flag capture.field values that are plausible real response fields, including 'status'/'body'", () => {
      const schema = baseSchema();
      firstCall(schema).capture = { as: "createdPost", field: "status" };
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "ambiguous_capture_field")).toBe(false);
    });
  });

  describe("[AC-n] title prefix", () => {
    it("flags a title missing the [AC-n] prefix matching its own ac_id", () => {
      const schema = baseSchema();
      schema.spec.cases[0]!.title = "should create a new post";
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "missing_ac_prefix")).toBe(true);
    });

    it("does not flag a title with the correct prefix", () => {
      const schema = baseSchema();
      const errors = collectApiCrossReferenceErrors(schema);
      expect(errors.some((e) => e.code === "missing_ac_prefix")).toBe(false);
    });
  });
});
