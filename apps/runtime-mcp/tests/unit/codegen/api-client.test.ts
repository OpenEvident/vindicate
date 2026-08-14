import { describe, expect, it } from "vitest";
import ts from "typescript";

import { buildApiBuilder, buildApiClient } from "../../../src/codegen/api-client.js";
import { builderDef, clientDef, clientMethod } from "../../shared/codegen-testkit/api-fixtures.js";

function assertSyntacticallyValid(source: string): void {
  const sourceFile = ts.createSourceFile("generated.ts", source, ts.ScriptTarget.ESNext, true);
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  expect(diagnostics).toEqual([]);
}

describe("buildApiClient", () => {
  it("extends BaseApiClient and imports it", () => {
    const source = buildApiClient(clientDef({ client_class: "PostClient" }));
    expect(source).toContain("import { BaseApiClient } from './BaseApiClient';");
    expect(source).toContain("export class PostClient extends BaseApiClient {");
    assertSyntacticallyValid(source);
  });

  it("renders a bodyless GET method with only the headers param", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        methods: [clientMethod("getAll", { http_method: "get", path: "posts" })]
      })
    );
    expect(source).toContain("getAll(headers?: Record<string, string>) {");
    expect(source).toContain("return this.request.get('posts', { headers });");
    assertSyntacticallyValid(source);
  });

  it("renders a path param as a template literal", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        methods: [
          clientMethod("getById", {
            http_method: "get",
            path: "posts/{postId}",
            path_params: [{ name: "postId", type: "number" }]
          })
        ]
      })
    );
    expect(source).toContain("getById(postId: number, headers?: Record<string, string>) {");
    expect(source).toContain("return this.request.get(`posts/${postId}`, { headers });");
    assertSyntacticallyValid(source);
  });

  it("orders params as path_params then body_param then headers, and renders data: for json body", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        methods: [
          clientMethod("update", {
            http_method: "put",
            path: "posts/{postId}",
            path_params: [{ name: "postId", type: "number" }],
            body_param: { name: "post", type: "Partial<Post>" },
            body_type: "json"
          })
        ]
      })
    );
    expect(source).toContain(
      "update(postId: number, post: Partial<Post>, headers?: Record<string, string>) {"
    );
    expect(source).toContain("return this.request.put(`posts/${postId}`, { data: post, headers });");
    assertSyntacticallyValid(source);
  });

  it("renders form body_type as a form: option and multipart as multipart:", () => {
    const formSource = buildApiClient(
      clientDef({
        client_class: "LoginClient",
        methods: [
          clientMethod("login", {
            http_method: "post",
            path: "login",
            body_param: { name: "creds", type: "{ username: string; password: string }" },
            body_type: "form"
          })
        ]
      })
    );
    expect(formSource).toContain("return this.request.post('login', { form: creds, headers });");
    assertSyntacticallyValid(formSource);

    const multipartSource = buildApiClient(
      clientDef({
        client_class: "UploadClient",
        methods: [
          clientMethod("uploadFile", {
            http_method: "post",
            path: "upload",
            body_param: { name: "file", type: "{ name: string; mimeType: string; buffer: Buffer }" },
            body_type: "multipart"
          })
        ]
      })
    );
    expect(multipartSource).toContain("return this.request.post('upload', { multipart: file, headers });");
    assertSyntacticallyValid(multipartSource);
  });

  it("omits the trailing headers param when supports_header_override is false", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        methods: [clientMethod("getAll", { http_method: "get", path: "posts", supports_header_override: false })]
      })
    );
    expect(source).toContain("getAll() {");
    expect(source).toContain("return this.request.get('posts');");
    assertSyntacticallyValid(source);
  });

  it("renders types inline before the class", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        types: [{ name: "Post", fields: [{ name: "id", type: "number" }, { name: "title", type: "string" }] }]
      })
    );
    expect(source.indexOf("export interface Post")).toBeLessThan(source.indexOf("export class PostClient"));
    assertSyntacticallyValid(source);
  });

  it("renders a method jsdoc block when provided", () => {
    const source = buildApiClient(
      clientDef({
        client_class: "PostClient",
        methods: [clientMethod("getAll", { http_method: "get", path: "posts", jsdoc: "Fetch every post." })]
      })
    );
    expect(source).toContain("/**\n   * Fetch every post.\n   */");
    assertSyntacticallyValid(source);
  });
});

describe("buildApiBuilder", () => {
  it("renders a defaultPayload const, fluent setters, and a single build() method", () => {
    const source = buildApiBuilder(
      builderDef({
        builder_class: "PostPayloadBuilder",
        target_type: "Post",
        fields: [
          { name: "title", type: "string", default: "'hello'" },
          { name: "userId", type: "number", default: "1" }
        ]
      })
    );
    expect(source).toContain("const defaultPayload: Post = {");
    expect(source).toContain("title: 'hello',");
    expect(source).toContain("userId: 1,");
    expect(source).toContain("export class PostPayloadBuilder {");
    expect(source).toContain("constructor(base: Post = defaultPayload) {");
    expect(source).toContain("withTitle(title: string): this {");
    expect(source).toContain("this.payload.title = title;");
    expect(source).toContain("withUserId(userId: number): this {");
    expect(source).toContain("build(): Post {");
    assertSyntacticallyValid(source);
  });

  it("imports target_type from owning_client when provided", () => {
    const source = buildApiBuilder(
      builderDef({
        builder_class: "PostPayloadBuilder",
        target_type: "Post",
        owning_client: "PostClient",
        fields: [{ name: "title", type: "string", default: "'hello'" }]
      })
    );
    expect(source).toContain("import { Post } from '../clients/PostClient';");
    assertSyntacticallyValid(source);
  });

  it("omits the type import when owning_client is not provided", () => {
    const source = buildApiBuilder(
      builderDef({
        builder_class: "PostPayloadBuilder",
        target_type: "Post",
        fields: [{ name: "title", type: "string", default: "'hello'" }]
      })
    );
    expect(source).not.toContain("import {");
    assertSyntacticallyValid(source);
  });
});
