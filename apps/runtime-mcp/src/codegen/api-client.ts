/**
 * @file Pure transforms: ClientDef/BuilderDef → resource-client / payload-builder .ts source.
 * The api-layer equivalent of page-object.ts. Types are declared inline in the owning client's
 * file (mirrors how PageDef.types render inline in the page object) — not a shared types file;
 * the fixed `vindicate-api` reference template's shared `types/index.ts` was a hand-authored choice
 * the schema doesn't model (ClientDef.types is per-client, same shape as PageDef.types).
 */
import { buildTypeDeclaration } from "./page-object.js";
import type { BuilderDef, BuilderField, ClientDef, ClientMethod } from "./api-schema.js";

const CLIENT_HEADER_COMMENT =
  "// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create_api/register_client for structural changes";

function pathExpression(path: string, pathParamNames: readonly string[]): string {
  if (pathParamNames.length === 0) {
    return `'${path}'`;
  }
  let templated = path;
  for (const name of pathParamNames) {
    templated = templated.replaceAll(`{${name}}`, `\${${name}}`);
  }
  return `\`${templated}\``;
}

function methodParams(method: ClientMethod): string {
  const pathParams = (method.path_params ?? []).map((p) => `${p.name}: ${p.type}`);
  const bodyParam = method.body_param !== undefined ? [`${method.body_param.name}: ${method.body_param.type}`] : [];
  const headerParam = method.supports_header_override ? ["headers?: Record<string, string>"] : [];
  return [...pathParams, ...bodyParam, ...headerParam].join(", ");
}

function requestOptionsObject(method: ClientMethod): string {
  const entries: string[] = [];
  if (method.body_param !== undefined && method.body_type !== undefined) {
    const bodyKey = method.body_type === "json" ? "data" : method.body_type;
    entries.push(`${bodyKey}: ${method.body_param.name}`);
  }
  if (method.supports_header_override) {
    entries.push("headers");
  }
  if (entries.length === 0) {
    return "";
  }
  return `, { ${entries.join(", ")} }`;
}

function buildClientMethod(method: ClientMethod): string {
  const pathParamNames = (method.path_params ?? []).map((p) => p.name);
  const call = `this.request.${method.http_method}(${pathExpression(method.path, pathParamNames)}${requestOptionsObject(method)})`;
  const jsdoc = method.jsdoc !== undefined ? [`  /**`, `   * ${method.jsdoc}`, `   */`] : [];
  return [...jsdoc, `  ${method.name}(${methodParams(method)}) {`, `    return ${call};`, `  }`].join("\n");
}

export function buildApiClient(client: ClientDef): string {
  const typeDeclarations = client.types.length > 0 ? `${client.types.map(buildTypeDeclaration).join("\n\n")}\n\n` : "";
  const methods = client.methods.map(buildClientMethod).join("\n\n");

  const parts = [
    CLIENT_HEADER_COMMENT,
    `import { BaseApiClient } from './BaseApiClient';`,
    "",
    typeDeclarations.trimEnd(),
    typeDeclarations.length > 0 ? "" : undefined,
    `export class ${client.client_class} extends BaseApiClient {`,
    methods,
    `}`
  ].filter((l): l is string => l !== undefined);

  return `${parts.join("\n")}\n`;
}

const BUILDER_HEADER_COMMENT =
  "// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create_api/register_client for structural changes";

function setterMethodName(field: BuilderField): string {
  return `with${field.name.charAt(0).toUpperCase()}${field.name.slice(1)}`;
}

function buildBuilderSetter(field: BuilderField): string {
  return [
    `  ${setterMethodName(field)}(${field.name}: ${field.type}): this {`,
    `    this.payload.${field.name} = ${field.name};`,
    `    return this;`,
    `  }`
  ].join("\n");
}

export function buildApiBuilder(builder: BuilderDef): string {
  const defaultFields = builder.fields.map((f) => `  ${f.name}: ${f.default},`).join("\n");
  const setters = builder.fields.map(buildBuilderSetter).join("\n\n");
  const header =
    builder.owning_client !== undefined
      ? `${BUILDER_HEADER_COMMENT}\n\nimport { ${builder.target_type} } from '../clients/${builder.owning_client}';`
      : BUILDER_HEADER_COMMENT;

  const parts = [
    header,
    "",
    `const defaultPayload: ${builder.target_type} = {`,
    defaultFields,
    `};`,
    "",
    `export class ${builder.builder_class} {`,
    `  private payload: ${builder.target_type};`,
    "",
    `  constructor(base: ${builder.target_type} = defaultPayload) {`,
    `    this.payload = { ...base };`,
    `  }`,
    "",
    setters,
    "",
    `  build(): ${builder.target_type} {`,
    `    return { ...this.payload };`,
    `  }`,
    `}`
  ];

  return `${parts.join("\n")}\n`;
}
