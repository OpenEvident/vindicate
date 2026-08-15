import { describe, expect, it } from "vitest";

import {
  ApiAssertionSchema,
  ApiFullSchemaSchema,
  AuthSetupSchema,
  ClientDefSchema,
  ClientMethodSchema,
  CreateApiSchema,
  GenerateApiCodeInputSchema
} from "../../../src/codegen/api-schema.js";

describe("api-schema", () => {
  describe("real-shape worked example — proves the schema can actually describe what was built", () => {
    // Mirrors the real, fixed vindicate-api template: PostClient (create/getAll/getById/update/delete),
    // PostPayloadBuilder, and the dummyjson.com token-once AuthClient (login/me).
    const fullSchema = {
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
          owning_client: "PostClient",
          fields: [
            { name: "title", type: "string", default: "'Playwright API test'" },
            {
              name: "body",
              type: "string",
              default: "'Automated with Playwright request context'"
            },
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
                  {
                    subject: "body_json",
                    matcher: "toMatchObject",
                    arg: "{ title: 'hello', body: 'world', userId: 1 }"
                  }
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
    };

    it("parses cleanly end to end", () => {
      const result = ApiFullSchemaSchema.safeParse(fullSchema);
      expect(result.success).toBe(true);
    });

    it("round-trips through the create_api operation envelope", () => {
      const result = CreateApiSchema.safeParse({
        mode: "create_api",
        feature: "posts",
        schema: fullSchema
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ClientMethodSchema — body_param/body_type must be paired", () => {
    it("accepts a method with neither body_param nor body_type", () => {
      expect(
        ClientMethodSchema.safeParse({ name: "getAll", http_method: "get", path: "posts" }).success
      ).toBe(true);
    });

    it("accepts a method with both body_param and body_type", () => {
      expect(
        ClientMethodSchema.safeParse({
          name: "create",
          http_method: "post",
          path: "posts",
          body_param: { name: "post", type: "Post" },
          body_type: "json"
        }).success
      ).toBe(true);
    });

    it("rejects body_param without body_type", () => {
      const result = ClientMethodSchema.safeParse({
        name: "create",
        http_method: "post",
        path: "posts",
        body_param: { name: "post", type: "Post" }
      });
      expect(result.success).toBe(false);
    });

    it("rejects body_type without body_param", () => {
      const result = ClientMethodSchema.safeParse({
        name: "create",
        http_method: "post",
        path: "posts",
        body_type: "json"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("AuthSetupSchema", () => {
    it("rejects a header_value_template missing the {token} placeholder", () => {
      const result = AuthSetupSchema.safeParse({
        login_http_method: "post",
        login_path: "auth/login",
        credential_params: [{ name: "username", type: "string" }],
        token_field: "accessToken",
        header_value_template: "Bearer no-placeholder-here"
      });
      expect(result.success).toBe(false);
    });

    it("defaults header_name and header_value_template when omitted", () => {
      const result = AuthSetupSchema.safeParse({
        login_http_method: "post",
        login_path: "auth/login",
        credential_params: [{ name: "username", type: "string" }],
        token_field: "accessToken"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.header_name).toBe("Authorization");
        expect(result.data.header_value_template).toBe("Bearer {token}");
      }
    });
  });

  describe("ApiAssertionSchema", () => {
    it("requires header_name when subject is 'header'", () => {
      const result = ApiAssertionSchema.safeParse({
        subject: "header",
        matcher: "toBe",
        arg: "'application/json'"
      });
      expect(result.success).toBe(false);
    });

    it("accepts a header assertion with header_name", () => {
      const result = ApiAssertionSchema.safeParse({
        subject: "header",
        header_name: "content-type",
        matcher: "toContain",
        arg: "'application/json'"
      });
      expect(result.success).toBe(true);
    });

    it("rejects toBeDefined with an arg (arg makes no sense for it)", () => {
      const result = ApiAssertionSchema.safeParse({
        subject: "body_json",
        matcher: "toBeDefined",
        arg: "1"
      });
      expect(result.success).toBe(false);
    });

    it("rejects toBe without an arg", () => {
      const result = ApiAssertionSchema.safeParse({ subject: "status", matcher: "toBe" });
      expect(result.success).toBe(false);
    });

    it("accepts toBeDefined with no arg", () => {
      const result = ApiAssertionSchema.safeParse({ subject: "body_json", matcher: "toBeDefined" });
      expect(result.success).toBe(true);
    });
  });

  describe("GenerateApiCodeInputSchema — discriminated union", () => {
    it("distinguishes register_client from create_api/add_api_test_cases", () => {
      const clientDef = ClientDefSchema.parse({
        feature: "users",
        client_class: "UsersClient",
        owned_by: "users",
        fixtures: ["usersApi"],
        types: [],
        methods: [
          {
            name: "getById",
            http_method: "get",
            path: "users/{userId}",
            path_params: [{ name: "userId", type: "number" }]
          }
        ]
      });
      const result = GenerateApiCodeInputSchema.safeParse({
        mode: "register_client",
        feature: "users",
        client: clientDef
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe("register_client");
      }
    });

    it("rejects an unknown mode", () => {
      const result = GenerateApiCodeInputSchema.safeParse({
        mode: "create",
        feature: "posts",
        schema: {}
      });
      expect(result.success).toBe(false);
    });

    it("validate_api requires schema when validateTarget is create_api", () => {
      const result = GenerateApiCodeInputSchema.safeParse({
        mode: "validate_api",
        validateTarget: "create_api",
        feature: "posts"
      });
      expect(result.success).toBe(false);
    });
  });
});
