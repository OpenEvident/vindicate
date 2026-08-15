/**
 * @file API-layer schema validation — the api-schema.ts equivalent of validate-codegen.ts.
 * Reuses the shared, genuinely-generic helpers (expected-data reference checking, TS-expression
 * validation, the quoted-env-var-arg detector, the ValidationError shape) rather than duplicating
 * them; only what's genuinely API-specific (client/method resolution, path-param placeholders) is
 * new here. Scope is deliberately narrower than the UI validator: the core structural/cross-
 * reference/expected-data correctness checks are covered; the UI validator's "inline literal
 * duplicates an expected key" style-nudge (not a correctness gate) isn't ported for v1.
 */
import type { ApiCall, ApiFullSchema, ApiTestCase, ClientDef, ClientMethod } from "./api-schema.js";
import {
  duplicateExpectedStringValues,
  expectedKeysInExpression,
  hasExpectedData
} from "./expected-ref.js";
import { tryValidateTsExpression } from "./expression-validate.js";
import { tryDetectQuotedEnvVarArg } from "./validate-codegen.js";
import type { ValidationError } from "./validation-errors.js";
import { validationError } from "./validation-errors.js";

function extractPathPlaceholders(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!.trim());
}

/** Playwright's APIRequestContext resolves a path starting with '/' as absolute — it drops any
 * path segment already in baseURL (e.g. a '/v2' prefix), the opposite of what a raw OpenAPI
 * `paths` key (always leading-slash by spec) leads an agent grounding from it to assume. The fixed
 * `vindicate-api` reference template's own methods are already relative ('posts/{postId}', no leading
 * slash) — this makes that the enforced convention instead of an unstated one. */
function collectLeadingSlashError(
  method: ClientMethod,
  clientClass: string,
  clientIndex: number,
  methodIndex: number
): ValidationError[] {
  if (!method.path.startsWith("/")) {
    return [];
  }
  return [
    validationError(
      "leading_slash_path",
      `clients[${clientIndex}].methods[${methodIndex}].path`,
      `Method '${method.name}' on client '${clientClass}' has path '${method.path}' starting with '/'.`,
      "Strip the leading '/' — Playwright joins a relative path onto baseURL (keeping any base path segment like '/v2'), but treats a leading-slash path as absolute and drops it.",
      '"path": "pet/{petId}"'
    )
  ];
}

function collectPathParamErrors(
  method: ClientMethod,
  clientClass: string,
  clientIndex: number,
  methodIndex: number
): ValidationError[] {
  const used = extractPathPlaceholders(method.path);
  const declared = (method.path_params ?? []).map((p) => p.name);
  const usedSet = new Set(used);
  const declaredSet = new Set(declared);
  const undeclared = used.filter((p) => !declaredSet.has(p));
  const unused = declared.filter((p) => !usedSet.has(p));

  if (undeclared.length === 0 && unused.length === 0) {
    return [];
  }
  const basePath = `clients[${clientIndex}].methods[${methodIndex}]`;
  const detail =
    undeclared.length > 0
      ? `uses {${undeclared[0]}} in its path which is not declared in path_params`
      : `declares unused path_param '${unused[0]}'`;
  return [
    validationError(
      "path_param_placeholder_mismatch",
      basePath,
      `Method '${method.name}' on client '${clientClass}' ${detail}.`,
      "Every {param} in path must have a matching path_params entry, and vice versa.",
      '{ "path": "posts/{postId}", "path_params": [{ "name": "postId", "type": "number" }] }'
    )
  ];
}

export function collectApiStructuralErrors(
  schema: ApiFullSchema,
  options?: { feature?: string }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenClientClasses = new Set<string>();
  const seenFixtures = new Map<string, number>();

  schema.clients.forEach((client, clientIndex) => {
    if (seenClientClasses.has(client.client_class)) {
      errors.push(
        validationError(
          "duplicate_client_class",
          `clients[${clientIndex}].client_class`,
          `Duplicate client_class '${client.client_class}'.`,
          "Every client in one create_api schema must have a unique client_class."
        )
      );
    }
    seenClientClasses.add(client.client_class);

    client.fixtures.forEach((fixture, fixtureIndex) => {
      const owner = seenFixtures.get(fixture);
      if (owner !== undefined) {
        errors.push(
          validationError(
            "duplicate_client_fixture",
            `clients[${clientIndex}].fixtures[${fixtureIndex}]`,
            `Fixture '${fixture}' is declared on both clients[${owner}] and clients[${clientIndex}] ('${client.client_class}').`,
            "Each fixture name must resolve to exactly one client — rename one of them."
          )
        );
      } else {
        seenFixtures.set(fixture, clientIndex);
      }
    });

    if (options?.feature !== undefined && client.owned_by !== options.feature) {
      errors.push(
        validationError(
          "owned_by_mismatch",
          `clients[${clientIndex}].owned_by`,
          `Client '${client.client_class}' has owned_by '${client.owned_by}' but create_api feature is '${options.feature}'.`,
          `Set owned_by to '${options.feature}'. owned_by is the feature slug, not the fixture name.`,
          `"owned_by": "${options.feature}"`
        )
      );
    }

    const seenMethodNames = new Set<string>();
    client.methods.forEach((method, methodIndex) => {
      if (seenMethodNames.has(method.name)) {
        errors.push(
          validationError(
            "duplicate_client_method_name",
            `clients[${clientIndex}].methods[${methodIndex}].name`,
            `Duplicate method name '${method.name}' on client '${client.client_class}'.`,
            "Rename one of the methods to be unique."
          )
        );
      }
      seenMethodNames.add(method.name);

      errors.push(
        ...collectLeadingSlashError(method, client.client_class, clientIndex, methodIndex)
      );
      errors.push(...collectPathParamErrors(method, client.client_class, clientIndex, methodIndex));
    });
  });

  return errors;
}

const ENV_VAR_EXPRESSION_PATTERN = /^process\.env\./;

/** True for a bare quoted/template literal, or one of the two other legitimate unquoted-string
 * conventions used everywhere else in this schema: `process.env.X!` (secrets) and `expected.key`
 * (test data) — neither is a "forgot the quotes" mistake, both are meant to stay bare. */
function isRecognizedStringExpression(expression: string): boolean {
  const trimmed = expression.trim();
  return (
    /^['"`]/.test(trimmed) ||
    ENV_VAR_EXPRESSION_PATTERN.test(trimmed) ||
    expectedKeysInExpression(trimmed).length > 0
  );
}

/** `BuilderField.default` is pasted verbatim (same convention as ApiCall.args) — nothing validated
 * it before now. A `type: "string"` field whose default isn't quoted (`name: VindicateTestPet`
 * instead of `name: 'VindicateTestPet'`) parses as a reference to an undeclared identifier: valid
 * syntax, guaranteed compile failure. Only fires for an exact `"string"` type (not a union or a
 * more specific literal type) to avoid false positives on legitimately unquoted defaults. */
export function collectApiBuilderErrors(schema: ApiFullSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  (schema.builders ?? []).forEach((builder, builderIndex) => {
    builder.fields.forEach((field, fieldIndex) => {
      const fieldPath = `builders[${builderIndex}].fields[${fieldIndex}].default`;
      const context = `Builder '${builder.builder_class}' field '${field.name}'`;

      if (field.type.trim() === "string" && !isRecognizedStringExpression(field.default)) {
        errors.push(
          validationError(
            "unquoted_string_builder_default",
            fieldPath,
            `${context} has type 'string' but default '${field.default}' is not a quoted string literal — generated code would reference it as an undeclared identifier, not a string value.`,
            "Quote the default, e.g. \"'Playwright API test'\".",
            `"default": "'Playwright API test'"`
          )
        );
      }

      const exprErr = tryValidateTsExpression(field.default, fieldPath, context);
      if (exprErr !== undefined) {
        errors.push(
          validationError(
            "invalid_builder_default",
            fieldPath,
            exprErr.message,
            exprErr.fix,
            exprErr.example
          )
        );
      }
    });
  });

  return errors;
}

function collectApiExpectedDataErrors(schema: ApiFullSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  if (schema.expected !== undefined && !hasExpectedData(schema.expected)) {
    errors.push(
      validationError(
        "empty_expected_block",
        "expected",
        "Top-level 'expected' is present but has no keys — omit 'expected' entirely or add keys.",
        "Remove 'expected' when all data comes from process.env, or add keys and reference expected.<key>.",
        '"expected": { "nonExistentPostId": 999999999 }'
      )
    );
  }
  if (hasExpectedData(schema.expected)) {
    for (const [value, keys] of duplicateExpectedStringValues(schema.expected)) {
      errors.push(
        validationError(
          "duplicate_expected_value",
          "expected",
          `Expected values for keys ${keys.map((k) => `'${k}'`).join(", ")} are identical ('${value}').`,
          "Give each expected key a distinct value, or reference one key from schema args/assertions.",
          `"expected": { "${keys[0]}": "..." }`
        )
      );
    }
  }

  const checkExpression = (expression: string, path: string, context: string): void => {
    for (const key of expectedKeysInExpression(expression)) {
      if (schema.expected === undefined) {
        errors.push(
          validationError(
            "expected_block_missing",
            path,
            `${context} references expected.${key} but schema has no top-level 'expected' object.`,
            "Add an 'expected' block with the referenced keys.",
            `"expected": { "${key}": "..." }`
          )
        );
      } else if (!(key in schema.expected)) {
        errors.push(
          validationError(
            "unknown_expected_key",
            path,
            `${context} references expected.${key} which is not defined in schema.expected.`,
            `Add "${key}" to the top-level expected object.`,
            `"${key}": "..."`
          )
        );
      }
    }
  };

  schema.spec.cases.forEach((testCase, caseIndex) => {
    testCase.calls.forEach((call, callIndex) => {
      call.args?.forEach((arg, argIndex) => {
        checkExpression(
          arg,
          `spec.cases[${caseIndex}].calls[${callIndex}].args[${argIndex}]`,
          `Call '${call.fixture}.${call.method}' arg[${argIndex}]`
        );
      });
      call.assertions.forEach((assertion, assertionIndex) => {
        if (assertion.arg !== undefined) {
          checkExpression(
            assertion.arg,
            `spec.cases[${caseIndex}].calls[${callIndex}].assertions[${assertionIndex}].arg`,
            `Assertion[${assertionIndex}] on '${call.fixture}.${call.method}'`
          );
        }
      });
    });
  });

  return errors;
}

function clientMethodParamCounts(client: ClientDef): Map<string, number> {
  const methods = new Map<string, number>();
  for (const method of client.methods) {
    const pathParamCount = method.path_params?.length ?? 0;
    const bodyParamCount = method.body_param !== undefined ? 1 : 0;
    methods.set(method.name, pathParamCount + bodyParamCount);
  }
  return methods;
}

/** Fixture name → owning client, across every declared client's `fixtures[]`. First declaration
 * wins on a collision; `duplicate_client_fixture` (structural pass) already flags the collision
 * itself, so cross-reference resolution doesn't need to re-report it. */
function buildFixtureIndex(schema: ApiFullSchema): Map<string, ClientDef> {
  const index = new Map<string, ClientDef>();
  for (const client of schema.clients) {
    for (const fixture of client.fixtures) {
      if (!index.has(fixture)) {
        index.set(fixture, client);
      }
    }
  }
  return index;
}

function collectApiCallErrors(
  fixtureIndex: Map<string, ClientDef>,
  callPath: string,
  call: ApiCall
): ValidationError[] {
  const errors: ValidationError[] = [];
  const client = fixtureIndex.get(call.fixture);
  if (client === undefined) {
    errors.push(
      validationError(
        "unknown_client_fixture",
        `${callPath}.fixture`,
        `Fixture '${call.fixture}' does not match any client's declared fixtures.`,
        "Add the fixture name to a client's fixtures[] or fix the fixture name in this call.",
        '"fixtures": ["postApi"]'
      )
    );
    return errors;
  }

  const paramCounts = clientMethodParamCounts(client);
  const expectedArgCount = paramCounts.get(call.method);
  if (expectedArgCount === undefined) {
    errors.push(
      validationError(
        "unknown_client_method",
        `${callPath}.method`,
        `Method '${call.method}' not found on client '${client.client_class}' (fixture '${call.fixture}').`,
        "Use an existing method name from clients[].methods.",
        '"method": "getById"'
      )
    );
    return errors;
  }

  const argCount = call.args?.length ?? 0;
  if (argCount !== expectedArgCount) {
    errors.push(
      validationError(
        "client_method_arg_count",
        `${callPath}.args`,
        `Call '${call.fixture}.${call.method}' expects ${expectedArgCount} arg(s) (path_params, then body_param if present) but received ${argCount}.`,
        expectedArgCount === 0
          ? "Remove args for this call."
          : `Provide ${expectedArgCount} TS expression string(s) in args, path params first then the body.`,
        '"args": ["postId", "{ title: \'updated\' }"]'
      )
    );
  }

  call.args?.forEach((arg, index) => {
    const argPath = `${callPath}.args[${index}]`;
    const argContext = `Call '${call.fixture}.${call.method}' arg[${index}]`;
    const quotedEnvErr = tryDetectQuotedEnvVarArg(arg, argPath, argContext);
    if (quotedEnvErr !== undefined) {
      errors.push(quotedEnvErr);
    }
    const exprErr = tryValidateTsExpression(arg, argPath, argContext);
    if (exprErr !== undefined) {
      errors.push(
        validationError(
          "invalid_api_call_arg",
          argPath,
          exprErr.message,
          exprErr.fix,
          exprErr.example
        )
      );
    }
  });

  call.assertions.forEach((assertion, index) => {
    if (assertion.arg === undefined) {
      return;
    }
    const argPath = `${callPath}.assertions[${index}].arg`;
    const exprErr = tryValidateTsExpression(
      assertion.arg,
      argPath,
      `Assertion[${index}] on '${call.fixture}.${call.method}'`
    );
    if (exprErr !== undefined) {
      // Already carries "invalid_assertion_arg" — same concept as the UI validator's own
      // assertion-arg check, reused as-is rather than inventing a parallel code for it.
      errors.push(exprErr);
    }
  });

  return errors;
}

function isValidIdentifierName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

/** Names from ApiAssertion's `subject` vocabulary that are near-certain mistakes as a real API
 * response field: `capture.field` is a dot-path INTO the already-parsed JSON body
 * (`(await response.json()).<field>`), not a body/subject selector — `field: "body_json"` renders
 * `(await response.json()).body_json`, which doesn't exist (a real response is never shaped
 * `{ body_json: {...} }`). Excludes `status`/`body`/`header`, which are common, entirely plausible
 * real field names (a resource's own status, a document's body/header) and would false-positive. */
const CAPTURE_FIELD_MISTAKE_NAMES = new Set(["body_json", "status_text"]);

/** `capture.as` becomes a real `const` declaration in the generated spec, so it must be a valid
 * identifier and must not collide with another capture or with this case's own auto-generated
 * response/response2/... variable names (positional, one per call) — either collision is a
 * guaranteed `Cannot redeclare block-scoped variable` compile error. */
function collectCaptureErrors(testCase: ApiTestCase, casePath: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const reservedResponseNames = new Set(
    testCase.calls.map((_, i) => (i === 0 ? "response" : `response${i + 1}`))
  );
  const seenCaptureNames = new Set<string>();

  testCase.calls.forEach((call, callIndex) => {
    if (call.capture === undefined) {
      return;
    }
    const capturePath = `${casePath}.calls[${callIndex}].capture`;
    const as = call.capture.as;

    if (call.capture.field !== undefined && CAPTURE_FIELD_MISTAKE_NAMES.has(call.capture.field)) {
      errors.push(
        validationError(
          "ambiguous_capture_field",
          `${capturePath}.field`,
          `capture.field '${call.capture.field}' looks like an ApiAssertion subject name, not a real response field — this would render '(await response.json()).${call.capture.field}', which almost certainly doesn't exist on the parsed body.`,
          "Omit 'field' entirely to capture the whole parsed body, or use the actual property name from the response (e.g. 'id').",
          '"capture": { "as": "createdPet", "field": "id" }'
        )
      );
    }

    if (!isValidIdentifierName(as)) {
      errors.push(
        validationError(
          "invalid_capture_name",
          `${capturePath}.as`,
          `capture.as '${as}' is not a valid variable name.`,
          "Use a plain identifier: letters, digits, _ or $, not starting with a digit.",
          '"capture": { "as": "createdPet", "field": "id" }'
        )
      );
      return;
    }

    const collidesWithResponse = reservedResponseNames.has(as);
    const collidesWithCapture = seenCaptureNames.has(as);
    if (collidesWithResponse || collidesWithCapture) {
      errors.push(
        validationError(
          "duplicate_capture_name",
          `${capturePath}.as`,
          `capture.as '${as}' collides with ${collidesWithCapture ? "another capture" : "this test case's own auto-generated response variable"} in the same test case.`,
          "Pick a capture.as name that doesn't collide with another capture or with response/response2/... in this case.",
          '"capture": { "as": "createdPet", "field": "id" }'
        )
      );
      return;
    }
    seenCaptureNames.add(as);
  });

  return errors;
}

/** generate.md documents `title: '[AC-n] should <verb> <outcome>'` for every API test case —
 * never mechanically enforced before now, letting a generated title silently drop the prefix. */
function collectTitlePrefixError(testCase: ApiTestCase, casePath: string): ValidationError[] {
  const expectedPrefix = `[${testCase.ac_id}]`;
  if (testCase.title.startsWith(expectedPrefix)) {
    return [];
  }
  return [
    validationError(
      "missing_ac_prefix",
      `${casePath}.title`,
      `Test case '${testCase.ac_id}' has title '${testCase.title}' which doesn't start with '${expectedPrefix}'.`,
      `Prefix the title with '${expectedPrefix}' (e.g. "${expectedPrefix} should create a pet").`,
      `"title": "${expectedPrefix} should create a pet"`
    )
  ];
}

export function collectApiCrossReferenceErrors(schema: ApiFullSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const acIds = new Set<string>();
  const fixtureIndex = buildFixtureIndex(schema);

  schema.spec.cases.forEach((testCase, caseIndex) => {
    const casePath = `spec.cases[${caseIndex}]`;
    if (acIds.has(testCase.ac_id)) {
      errors.push(
        validationError(
          "duplicate_ac_id",
          `${casePath}.ac_id`,
          `Duplicate ac_id '${testCase.ac_id}' in spec.cases.`,
          "Each test case must have a unique ac_id.",
          '"ac_id": "AC-2"'
        )
      );
    }
    acIds.add(testCase.ac_id);

    errors.push(...collectTitlePrefixError(testCase, casePath));
    errors.push(...collectCaptureErrors(testCase, casePath));

    testCase.calls.forEach((call, callIndex) => {
      errors.push(...collectApiCallErrors(fixtureIndex, `${casePath}.calls[${callIndex}]`, call));
    });
  });

  return errors;
}

export function validateApiFullSchema(schema: ApiFullSchema, feature?: string): ValidationError[] {
  return [
    ...collectApiStructuralErrors(schema, feature !== undefined ? { feature } : undefined),
    ...collectApiBuilderErrors(schema),
    ...collectApiExpectedDataErrors(schema),
    ...collectApiCrossReferenceErrors(schema)
  ];
}
