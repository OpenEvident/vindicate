import type { ZodError, ZodIssue } from "zod";

import {
  deriveFieldName,
  deriveLocator,
  isDynamicElement,
  resolveStructuredLocator
} from "./locator-derive.js";
import {
  duplicateExpectedStringValues,
  expectedKeysForStringValue,
  expectedKeysInExpression,
  hasExpectedData
} from "./expected-ref.js";
import { tryValidateTsExpression } from "./expression-validate.js";
import type { ElementDescriptor, FullSchema, PageDef, StepDef, TestCase } from "./schema.js";
import {
  stringLiteralFromAssertionArg,
  tryDetectBaseUrlUnsafeGlob,
  tryDetectMalformedUrlPattern
} from "./url-pattern-validate.js";
import type { ValidationError } from "./validation-errors.js";
import { validationError } from "./validation-errors.js";
import { buildActionError, buildMatcherError, flattenZodIssues } from "./validation.js";

export function fixtureNameFromClass(pageClass: string): string {
  return pageClass.charAt(0).toLowerCase() + pageClass.slice(1);
}

const CREDENTIAL_REF_PATTERN = /email|password|username|credential|secret|token|passwd/i;
const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** TS string literal whose content is process.env.* (common AI mistake). */
const QUOTED_ENV_VAR_PATTERN = /^(['"])(process\.env\.[^'"]+)\1$/;

function bodyCallArgCountExample(paramCount: number): string | undefined {
  if (paramCount === 0) {
    return undefined;
  }
  if (paramCount === 1) {
    return '"args": ["process.env.AUTH_EMAIL!"] or "args": ["expected.invalidEmail"]';
  }
  return '"args": ["process.env.AUTH_EMAIL!", "expected.invalidPassword"]';
}

export function tryDetectQuotedEnvVarArg(
  expression: string,
  path: string,
  context: string
): ValidationError | undefined {
  const trimmed = expression.trim();
  const match = QUOTED_ENV_VAR_PATTERN.exec(trimmed);
  if (match === null) {
    return undefined;
  }
  const envExpression = match[2];
  return validationError(
    "quoted_env_var_arg",
    path,
    `${context}: '${trimmed}' is a string literal, not an env read — generated tests will pass the text "${envExpression}" to the step.`,
    "Remove the surrounding string quotes; use a bare process.env expression in BodyCall.args.",
    envExpression
  );
}

function collectSecretInStepValueErrors(
  action: {
    do: "fill" | "select" | "type";
    ref: string;
    value?: string | undefined;
    param?: string | undefined;
  },
  step: StepDef,
  pageIndex: number,
  stepIndex: number,
  actionIndex: number,
  pageClass: string
): ValidationError[] {
  if (action.value === undefined) {
    return [];
  }

  const basePath = `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}]`;
  const credentialRef = CREDENTIAL_REF_PATTERN.test(action.ref);
  const emailValue = EMAIL_VALUE_PATTERN.test(action.value);
  if (!credentialRef && !emailValue) {
    return [];
  }

  return [
    validationError(
      "secret_in_step_value",
      `${basePath}.value`,
      `Step '${step.name}' in page '${pageClass}' ${action.do} action bakes a credential-like literal into the page object via 'value'.`,
      "Use 'param' on the fill/type/select action and pass values via spec BodyCall.args (process.env.X! for secrets, expected.key for test data).",
      '{ "do": "fill", "ref": "emailInput", "param": "email" }'
    )
  ];
}

function zodPathToString(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "input";
  }
  let result = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
    } else {
      const text = typeof segment === "symbol" ? segment.toString() : segment;
      result += result.length === 0 ? text : `.${text}`;
    }
  }
  return result;
}

function zodIssueReceivedText(issue: ZodIssue): string | undefined {
  if (!("received" in issue)) {
    return undefined;
  }
  const value = (issue as { received?: unknown }).received;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return undefined;
}

function zodIssueToValidationError(issue: ZodIssue): ValidationError {
  const path = zodPathToString(issue.path);
  const message = issue.message;
  const received = zodIssueReceivedText(issue) ?? "";

  if (path.endsWith(".do") && message.toLowerCase().includes("invalid discriminator")) {
    const built = buildActionError(path, received || "unknown");
    return validationError("schema_shape", built.field, built.validationMessage, built.fix);
  }
  if (path.endsWith(".matcher") && message.toLowerCase().includes("invalid option")) {
    const built = buildMatcherError(path, received || "unknown");
    return validationError("schema_shape", built.field, built.validationMessage, built.fix);
  }
  if (received.length > 0) {
    if (path.endsWith(".do")) {
      const built = buildActionError(path, received);
      return validationError("schema_shape", built.field, built.validationMessage, built.fix);
    }
    if (path.endsWith(".matcher")) {
      const built = buildMatcherError(path, received);
      return validationError("schema_shape", built.field, built.validationMessage, built.fix);
    }
  }

  return validationError(
    "schema_shape",
    path || "input",
    message,
    `Fix the value at '${path || "input"}' — ${message.toLowerCase()}`
  );
}

export function zodIssuesToValidationErrors(err: ZodError): ValidationError[] {
  return flattenZodIssues(err).map(zodIssueToValidationError);
}

function collectSpecFixtures(schema: FullSchema): Set<string> {
  const fixtures = new Set<string>();
  if (schema.spec.before_each !== null) {
    for (const call of schema.spec.before_each) {
      fixtures.add(call.fixture);
    }
  }
  for (const testCase of schema.spec.cases) {
    for (const call of testCase.body) {
      fixtures.add(call.fixture);
    }
  }
  return fixtures;
}

function collectOwnedByErrors(schema: FullSchema, feature: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const pageByFixture = new Map<string, PageDef>();
  for (const page of schema.pages) {
    pageByFixture.set(fixtureNameFromClass(page.page_class), page);
  }

  for (const fixture of collectSpecFixtures(schema)) {
    const page = pageByFixture.get(fixture);
    if (page === undefined) {
      continue;
    }
    if (page.owned_by !== feature) {
      const pageIndex = schema.pages.indexOf(page);
      errors.push(
        validationError(
          "owned_by_mismatch",
          `pages[${pageIndex}].owned_by`,
          `Page '${page.page_class}' (fixture '${fixture}') has owned_by '${page.owned_by}' but create feature is '${feature}'.`,
          `Set owned_by to '${feature}'. owned_by is the feature slug, not the fixture name (example: '${fixture}').`,
          `"owned_by": "${feature}"`
        )
      );
    }
  }
  return errors;
}

function collectValueOrParamErrors(
  action: { value?: string | undefined; param?: string | undefined },
  step: StepDef,
  pageIndex: number,
  stepIndex: number,
  actionIndex: number,
  pageClass: string,
  actionName: "fill" | "select" | "type"
): ValidationError[] {
  const basePath = `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}]`;
  const hasValue = action.value !== undefined;
  const hasParam = action.param !== undefined;
  if (hasValue === hasParam) {
    return [
      validationError(
        "fill_value_param_exclusive",
        basePath,
        `Step '${step.name}' in page '${pageClass}' ${actionName} action must have exactly one of 'value' or 'param'.`,
        `Provide a literal 'value' string or a 'param' name referencing a step param.`,
        actionName === "select"
          ? '{ "do": "select", "ref": "country", "param": "country" }'
          : `{ "do": "${actionName}", "ref": "email", "param": "email" }`
      )
    ];
  }
  if (hasParam && !step.params.some((p) => p.name === action.param)) {
    return [
      validationError(
        "unknown_step_param",
        `${basePath}.param`,
        `Step '${step.name}' in page '${pageClass}' ${actionName} action references param '${action.param}' which is not declared in step params.`,
        `Add { "name": "${action.param}", "type": "string" } to the step params array, or use a literal 'value'.`,
        `{ "name": "${action.param}", "type": "string" }`
      )
    ];
  }
  return [];
}

function extractPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!.trim());
}

/** The locator field that deriveLocator templatizes for this element (the `{param}`-bearing slot). */
function locatorValueForPlaceholders(el: ElementDescriptor): string | undefined {
  const loc = resolveStructuredLocator(el);
  if (loc === undefined) return undefined;
  switch (loc.strategy) {
    case "testid":
    case "label":
    case "placeholder":
    case "text":
      return loc.value;
    case "role_name":
    case "scoped":
      return loc.name;
    case "testid_xpath":
    case "dom_id":
    case "attr_combo":
    case "sibling_text":
    case "nth":
      return loc.xpath;
    default:
      return undefined;
  }
}

function collectDynamicElementErrors(
  el: ElementDescriptor,
  pageIndex: number,
  elementIndex: number,
  pageClass: string
): ValidationError[] {
  const valueField = locatorValueForPlaceholders(el);
  const used = valueField !== undefined ? extractPlaceholders(valueField) : [];
  const basePath = `pages[${pageIndex}].elements[${elementIndex}]`;

  if (!isDynamicElement(el)) {
    if (used.length > 0) {
      return [
        validationError(
          "dynamic_placeholder_mismatch",
          basePath,
          `Element '${el.ref}' in page '${pageClass}' has {${used[0]}} placeholder(s) in its locator value but no 'dynamic' params declared.`,
          "Declare a 'dynamic' param for each {placeholder}, or remove the braces if the value is literal.",
          '"dynamic": [{ "name": "id", "type": "string" }]'
        )
      ];
    }
    return [];
  }

  const declared = (el.dynamic ?? []).map((p) => p.name);
  const declaredSet = new Set(declared);
  const usedSet = new Set(used);
  const unusedParams = declared.filter((p) => !usedSet.has(p));
  const undeclared = used.filter((p) => !declaredSet.has(p));

  if (used.length === 0 || unusedParams.length > 0 || undeclared.length > 0) {
    const detail =
      used.length === 0
        ? "declares dynamic params but its locator value has no {placeholder}"
        : undeclared.length > 0
          ? `uses {${undeclared[0]}} which is not a declared dynamic param`
          : `declares unused dynamic param '${unusedParams[0]}'`;
    return [
      validationError(
        "dynamic_placeholder_mismatch",
        basePath,
        `Dynamic element '${el.ref}' in page '${pageClass}' ${detail}.`,
        "Every dynamic param must appear once as a {param} placeholder in the locator value (testid/name), and vice versa.",
        '{ "testid": "delete-product-{id}", "testid_attr": "data-testid", "dynamic": [{ "name": "id", "type": "string" }] }'
      )
    ];
  }
  return [];
}

/** Validates refArgs against the referenced element's dynamic-param count. */
function collectRefArgsErrors(
  ref: string,
  refArgs: readonly string[] | undefined,
  elementByRef: Map<string, ElementDescriptor>,
  path: string,
  context: string
): ValidationError[] {
  const el = elementByRef.get(ref);
  if (el === undefined) {
    return []; // ghost ref handled elsewhere
  }
  const errors: ValidationError[] = [];
  const dynCount = isDynamicElement(el) ? (el.dynamic ?? []).length : 0;
  const got = refArgs?.length ?? 0;

  if (dynCount === 0) {
    if (got > 0) {
      errors.push(
        validationError(
          "dynamic_ref_args",
          `${path}.refArgs`,
          `${context} passes refArgs but element '${ref}' is not dynamic.`,
          "Remove refArgs, or declare 'dynamic' params on the element to make it parameterized.",
          undefined
        )
      );
    }
    return errors;
  }

  if (got !== dynCount) {
    errors.push(
      validationError(
        "dynamic_ref_args",
        `${path}.refArgs`,
        `${context} must pass ${dynCount} refArg(s) for dynamic element '${ref}' but passed ${got}.`,
        `Provide ${dynCount} TS expression string(s) in refArgs, one per dynamic param.`,
        '"refArgs": ["productId"]'
      )
    );
  }

  (refArgs ?? []).forEach((arg, index) => {
    const exprErr = tryValidateTsExpression(arg, `${path}.refArgs[${index}]`, `${context} refArg`);
    if (exprErr !== undefined) {
      errors.push(exprErr);
    }
  });

  return errors;
}

export function collectStructuralErrors(
  schema: FullSchema,
  options?: { feature?: string }
): ValidationError[] {
  const errors: ValidationError[] = [];

  schema.pages.forEach((page, pageIndex) => {
    const fieldNames = new Map<string, string>();
    const seenElementRefs = new Set<string>();
    const elementByRef = new Map(page.elements.map((e) => [e.ref, e]));
    page.elements.forEach((el, elementIndex) => {
      if (seenElementRefs.has(el.ref)) {
        errors.push(
          validationError(
            "duplicate_element_ref",
            `pages[${pageIndex}].elements[${elementIndex}].ref`,
            `Duplicate element ref '${el.ref}' in page '${page.page_class}'.`,
            "Rename duplicate refs so each element ref is unique within a page."
          )
        );
      }
      seenElementRefs.add(el.ref);

      const name = deriveFieldName(el);
      const existing = fieldNames.get(name);
      if (existing !== undefined) {
        errors.push(
          validationError(
            "field_name_collision",
            `pages[${pageIndex}].elements[${elementIndex}].ref`,
            `Field name collision in page '${page.page_class}': refs '${existing}' and '${el.ref}' both derive field name '${name}'.`,
            "Give one of the elements a unique testid or name to disambiguate the field name."
          )
        );
      }
      fieldNames.set(name, el.ref);
    });

    const elementRefs = new Set(page.elements.map((e) => e.ref));
    page.steps.forEach((step, stepIndex) => {
      step.actions.forEach((action, actionIndex) => {
        if ("ref" in action && !elementRefs.has(action.ref)) {
          errors.push(
            validationError(
              "ghost_element_ref",
              `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}].ref`,
              `Step '${step.name}' in page '${page.page_class}' uses ref '${action.ref}' which is not in the elements array.`,
              `Add the element with ref '${action.ref}' to pages[${pageIndex}].elements, or correct the ref.`
            )
          );
        }
        if ("ref" in action) {
          errors.push(
            ...collectRefArgsErrors(
              action.ref,
              "refArgs" in action ? action.refArgs : undefined,
              elementByRef,
              `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}]`,
              `Step '${step.name}' in page '${page.page_class}' ${action.do} action`
            )
          );
        }
        if (action.do === "drag") {
          if (!elementRefs.has(action.toRef)) {
            errors.push(
              validationError(
                "ghost_element_ref",
                `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}].toRef`,
                `Step '${step.name}' in page '${page.page_class}' drag uses toRef '${action.toRef}' which is not in the elements array.`,
                `Add the element with ref '${action.toRef}' to pages[${pageIndex}].elements, or correct the toRef.`
              )
            );
          }
          errors.push(
            ...collectRefArgsErrors(
              action.toRef,
              action.toRefArgs,
              elementByRef,
              `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}]`,
              `Step '${step.name}' in page '${page.page_class}' drag target`
            )
          );
        }
        if (action.do === "fill" || action.do === "select" || action.do === "type") {
          errors.push(
            ...collectValueOrParamErrors(
              action,
              step,
              pageIndex,
              stepIndex,
              actionIndex,
              page.page_class,
              action.do
            ),
            ...collectSecretInStepValueErrors(
              action,
              step,
              pageIndex,
              stepIndex,
              actionIndex,
              page.page_class
            )
          );
        }
        if (action.do === "waitForURL") {
          const actionPath = `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}].pattern`;
          const globErr = tryDetectMalformedUrlPattern(
            action.pattern,
            actionPath,
            `Step '${step.name}' in page '${page.page_class}' waitForURL pattern`
          );
          if (globErr !== undefined) {
            errors.push(globErr);
          }
        }
      });
    });

    page.verifies.forEach((verify, verifyIndex) => {
      verify.assertions.forEach((assertion, assertionIndex) => {
        const assertionPath = `pages[${pageIndex}].verifies[${verifyIndex}].assertions[${assertionIndex}]`;
        if ("ref" in assertion && !elementRefs.has(assertion.ref)) {
          errors.push(
            validationError(
              "ghost_element_ref",
              `${assertionPath}.ref`,
              `Verify '${verify.name}' in page '${page.page_class}' uses ref '${assertion.ref}' which is not in the elements array.`,
              `Add the element with ref '${assertion.ref}' to pages[${pageIndex}].elements, or correct the ref.`
            )
          );
        }
        if (assertion.subject === "element") {
          errors.push(
            ...collectRefArgsErrors(
              assertion.ref,
              assertion.refArgs,
              elementByRef,
              assertionPath,
              `Verify '${verify.name}' in page '${page.page_class}' assertion`
            )
          );
        }
        if (assertion.arg !== undefined && assertion.arg.length > 0) {
          const exprErr = tryValidateTsExpression(
            assertion.arg,
            `${assertionPath}.arg`,
            `Verify '${verify.name}' in page '${page.page_class}' assertion arg`
          );
          if (exprErr !== undefined) {
            errors.push(exprErr);
          }
          if (assertion.subject === "page" && assertion.matcher === "toHaveURL") {
            const literal = stringLiteralFromAssertionArg(assertion.arg);
            if (literal !== undefined) {
              const globErr = tryDetectMalformedUrlPattern(
                literal,
                `${assertionPath}.arg`,
                `Verify '${verify.name}' in page '${page.page_class}' toHaveURL arg`
              );
              if (globErr !== undefined) {
                errors.push(globErr);
              }
              const baseUrlErr = tryDetectBaseUrlUnsafeGlob(
                literal,
                `${assertionPath}.arg`,
                `Verify '${verify.name}' in page '${page.page_class}' toHaveURL arg`
              );
              if (baseUrlErr !== undefined) {
                errors.push(baseUrlErr);
              }
            }
          }
        }
      });
    });

    const stepNames = new Set<string>();
    page.steps.forEach((step, stepIndex) => {
      if (stepNames.has(step.name)) {
        errors.push(
          validationError(
            "duplicate_step_name",
            `pages[${pageIndex}].steps[${stepIndex}].name`,
            `Duplicate step name '${step.name}' in page '${page.page_class}'.`,
            "Rename one of the steps to be unique."
          )
        );
      }
      stepNames.add(step.name);
    });

    const verifyNames = new Set<string>();
    page.verifies.forEach((verify, verifyIndex) => {
      if (verifyNames.has(verify.name)) {
        errors.push(
          validationError(
            "duplicate_verify_name",
            `pages[${pageIndex}].verifies[${verifyIndex}].name`,
            `Duplicate verify name '${verify.name}' in page '${page.page_class}'.`,
            "Rename one of the verifies to be unique."
          )
        );
      }
      verifyNames.add(verify.name);
    });

    page.elements.forEach((el, elementIndex) => {
      try {
        deriveLocator(el);
      } catch (err: unknown) {
        if (err instanceof Error) {
          errors.push(
            validationError(
              "locator_missing",
              `pages[${pageIndex}].elements[${elementIndex}]`,
              err.message,
              `Add testid+testid_attr, role, or name to element '${el.ref}'.`,
              '{ "testid": "submit", "testid_attr": "data-testid" }'
            )
          );
        }
      }
      // Confirmed live mistake: a hand-authored 'text' locator carried a 'container' field, copying the
      // 'scoped' strategy's shape in the belief it would scope the getByText search to that container —
      // `container` is only ever consulted for `scoped` (see resolveRoleChain, @vindicate/protocol), so it
      // silently does nothing for every other strategy, and the resulting getByText call searches the
      // whole page instead of the intended container.
      if (el.locator?.container !== undefined && el.locator.strategy !== "scoped") {
        errors.push(
          validationError(
            "container_ignored_for_strategy",
            `pages[${pageIndex}].elements[${elementIndex}].locator.container`,
            `Element '${el.ref}' has a 'container' on a '${el.locator.strategy}' locator — container is only used by the 'scoped' strategy and is silently ignored here, so this locator will search the whole page, not just that container.`,
            "Remove 'container', or use a captured 'scoped' locator (container + role/name) if you need the search anchored to a specific row/container.",
            '{ "strategy": "scoped", "confidence": "high", "role": "button", "name": "Delete", "container": { "role": "row", "name": "Jane Doe" } }'
          )
        );
      }
      errors.push(...collectDynamicElementErrors(el, pageIndex, elementIndex, page.page_class));
    });

    if (page.is_panel === true && page.path !== undefined) {
      errors.push(
        validationError(
          "panel_has_path",
          `pages[${pageIndex}].path`,
          `Panel '${page.page_class}' must not have a 'path' field.`,
          "Remove the 'path' field from the panel definition."
        )
      );
    }
    if (page.is_panel !== true && page.path === undefined) {
      errors.push(
        validationError(
          "page_missing_path",
          `pages[${pageIndex}]`,
          `Page '${page.page_class}' is missing the required 'path' field.`,
          "Add a 'path' field (e.g. '/dashboard') or set 'is_panel: true' if this is a panel.",
          '"path": "/login"'
        )
      );
    }
  });

  if (options?.feature !== undefined) {
    errors.push(...collectOwnedByErrors(schema, options.feature));
  }

  return errors;
}

/** TS regex literal in schema arg expressions. */
const REGEX_LITERAL = /^\/(\\.|[^/])+\/[gimsuy]*$/;

function isInlineStringLiteral(expression: string): boolean {
  return stringLiteralFromAssertionArg(expression.trim()) !== undefined;
}

function isUrlPathStringLiteral(expression: string): boolean {
  const value = stringLiteralFromAssertionArg(expression.trim());
  return value !== undefined && value.startsWith("/");
}

function findExpectedKeysForInlineLiteral(
  expectedData: Record<string, unknown>,
  literal: string,
  isRegex: boolean
): string[] {
  if (isRegex) {
    return expectedKeysForStringValue(expectedData, literal.trim());
  }
  const unquoted = stringLiteralFromAssertionArg(literal.trim());
  if (unquoted === undefined) {
    return [];
  }
  return expectedKeysForStringValue(expectedData, unquoted);
}

function tryDetectInlineTestData(
  expression: string,
  path: string,
  context: string,
  expectedData: FullSchema["expected"]
): ValidationError | undefined {
  const trimmed = expression.trim();
  const isInlineString = isInlineStringLiteral(trimmed) && !isUrlPathStringLiteral(trimmed);
  const isInlineRegex = REGEX_LITERAL.test(trimmed);
  if (!isInlineString && !isInlineRegex) {
    return undefined;
  }

  if (!hasExpectedData(expectedData)) {
    if (isInlineString) {
      return validationError(
        "use_expected_for_test_data",
        path,
        `${context} uses inline string literal ${trimmed}; put non-secret test data in top-level expected and reference expected.<key>.`,
        "Add an expected block with the value and use expected.<key> in args or assertion arg.",
        `"expected": { "invalidEmail": "invalid@example.com" }`
      );
    }
    return validationError(
      "use_expected_for_test_data",
      path,
      `${context} uses inline regex ${trimmed}; put shared assertion patterns in top-level expected and reference expected.<key>.`,
      "Add an expected block with the regex string and use expected.<key> in assertion arg.",
      `"expected": { "authErrorPattern": "/invalid|error/i" }`
    );
  }

  const matchingKeys = findExpectedKeysForInlineLiteral(expectedData, trimmed, isInlineRegex);
  if (matchingKeys.length === 0) {
    return undefined;
  }

  const primaryKey = matchingKeys[0]!;
  const keyHint =
    matchingKeys.length === 1
      ? `expected.${primaryKey}`
      : matchingKeys.map((k) => `expected.${k}`).join(" or ");

  return validationError(
    "inline_test_data_with_expected_block",
    path,
    `${context} duplicates ${keyHint} as inline ${isInlineRegex ? "regex" : "string"} ${trimmed}; use ${keyHint}.`,
    `Use ${keyHint} instead of the inline literal.`,
    `"arg": "expected.${primaryKey}"`
  );
}

function collectExpectedBlockShapeErrors(schema: FullSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  if (schema.expected !== undefined && !hasExpectedData(schema.expected)) {
    errors.push(
      validationError(
        "empty_expected_block",
        "expected",
        "Top-level 'expected' is present but has no keys — omit 'expected' entirely or add keys.",
        "Remove 'expected' when all data comes from process.env, or add keys like invalidEmail and reference expected.<key>.",
        '"expected": { "invalidEmail": "invalid@example.com" }'
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
  return errors;
}

function collectExpectedReferenceErrors(
  expression: string,
  path: string,
  context: string,
  expectedData: FullSchema["expected"]
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of expectedKeysInExpression(expression)) {
    if (expectedData === undefined) {
      errors.push(
        validationError(
          "expected_block_missing",
          path,
          `${context} references expected.${key} but schema has no top-level 'expected' object.`,
          "Add an 'expected' block with the referenced keys.",
          `"expected": { "${key}": "..." }`
        )
      );
    } else if (!(key in expectedData)) {
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
  return errors;
}

function collectExpectedDataErrors(schema: FullSchema): ValidationError[] {
  const errors: ValidationError[] = [...collectExpectedBlockShapeErrors(schema)];

  schema.pages.forEach((page, pageIndex) => {
    page.verifies.forEach((verify, verifyIndex) => {
      verify.assertions.forEach((assertion, assertionIndex) => {
        if (assertion.arg === undefined || assertion.arg.length === 0) {
          return;
        }
        const path = `pages[${pageIndex}].verifies[${verifyIndex}].assertions[${assertionIndex}].arg`;
        errors.push(
          ...collectExpectedReferenceErrors(
            assertion.arg,
            path,
            `Verify '${verify.name}' in page '${page.page_class}' assertion arg`,
            schema.expected
          )
        );
        const inlineErr = tryDetectInlineTestData(
          assertion.arg,
          path,
          `Verify '${verify.name}' in page '${page.page_class}' assertion arg`,
          schema.expected
        );
        if (inlineErr !== undefined) {
          errors.push(inlineErr);
        }
      });
    });
  });

  const collectBodyExpected = (
    bodyPath: string,
    args: string[] | undefined,
    context: string
  ): void => {
    args?.forEach((arg, index) => {
      const argPath = `${bodyPath}.args[${index}]`;
      errors.push(...collectExpectedReferenceErrors(arg, argPath, context, schema.expected));
      const inlineErr = tryDetectInlineTestData(
        arg,
        argPath,
        `${context}[${index}]`,
        schema.expected
      );
      if (inlineErr !== undefined) {
        errors.push(inlineErr);
      }
    });
  };

  schema.spec.cases.forEach((testCase, caseIndex) => {
    testCase.body.forEach((bodyCall, callIndex) => {
      collectBodyExpected(
        `spec.cases[${caseIndex}].body[${callIndex}]`,
        bodyCall.args,
        `Body call '${bodyCall.fixture}.${bodyCall.call}' arg`
      );
    });
  });

  if (schema.spec.before_each !== null) {
    schema.spec.before_each.forEach((bodyCall, callIndex) => {
      collectBodyExpected(
        `spec.before_each[${callIndex}]`,
        bodyCall.args,
        `before_each '${bodyCall.fixture}.${bodyCall.call}' arg`
      );
    });
  }

  return errors;
}

function pageMethods(page: PageDef): Map<string, { kind: "step" | "verify"; paramCount: number }> {
  const methods = new Map<string, { kind: "step" | "verify"; paramCount: number }>();
  for (const step of page.steps) {
    methods.set(step.name, { kind: "step", paramCount: step.params.length });
  }
  for (const verify of page.verifies) {
    methods.set(verify.name, { kind: "verify", paramCount: verify.params.length });
  }
  return methods;
}

function collectBodyCallErrors(
  schema: FullSchema,
  bodyPath: string,
  fixture: string,
  call: string,
  args: string[] | undefined
): ValidationError[] {
  const errors: ValidationError[] = [];
  const page = schema.pages.find((p) => fixtureNameFromClass(p.page_class) === fixture);
  if (page === undefined) {
    errors.push(
      validationError(
        "unknown_fixture",
        `${bodyPath}.fixture`,
        `Fixture '${fixture}' does not match any page_class in pages (expected a camelCase page class like 'loginPage' for LoginPage).`,
        "Add a page with the matching page_class or fix the fixture name.",
        '"page_class": "LoginPage"'
      )
    );
    return errors;
  }

  const methods = pageMethods(page);
  const method = methods.get(call);
  if (method === undefined) {
    errors.push(
      validationError(
        "unknown_body_call",
        `${bodyPath}.call`,
        `Call '${call}' not found on page '${page.page_class}' (fixture '${fixture}').`,
        `Use an existing step_* or verify_* method name from pages[].steps / pages[].verifies.`,
        '"call": "step_navigate"'
      )
    );
    return errors;
  }

  const argCount = args?.length ?? 0;
  if (argCount !== method.paramCount) {
    errors.push(
      validationError(
        "body_call_arg_count",
        `${bodyPath}.args`,
        `Call '${fixture}.${call}' expects ${method.paramCount} arg(s) but received ${argCount}.`,
        method.paramCount === 0
          ? "Remove args for this call."
          : `Provide ${method.paramCount} TS expression string(s) in args.`,
        bodyCallArgCountExample(method.paramCount)
      )
    );
  }

  if (args !== undefined) {
    args.forEach((arg, index) => {
      const argPath = `${bodyPath}.args[${index}]`;
      const argContext = `Body call '${fixture}.${call}' arg[${index}]`;
      const quotedEnvErr = tryDetectQuotedEnvVarArg(arg, argPath, argContext);
      if (quotedEnvErr !== undefined) {
        errors.push(quotedEnvErr);
      }
      const exprErr = tryValidateTsExpression(arg, argPath, argContext);
      if (exprErr !== undefined) {
        errors.push(
          validationError(
            "invalid_body_call_arg",
            `${bodyPath}.args[${index}]`,
            exprErr.message,
            exprErr.fix,
            exprErr.example
          )
        );
      }
    });
  }

  return errors;
}

/** Illustrative patterns from docs/examples — rejected unless listed in observed_endpoints. */
export const DOCUMENTATION_WAITFORRESPONSE_PATTERNS = ["/auth/validate", "/api/login"] as const;

export function urlPatternMatchesObservedEndpoint(
  urlPattern: string,
  observedEndpoints: readonly string[]
): boolean {
  return observedEndpoints.some((endpoint) => endpoint.includes(urlPattern));
}

function collectWaitForResponseErrors(schema: FullSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const observed = schema.observed_endpoints ?? [];
  const waitActions: Array<{
    pageClass: string;
    stepName: string;
    path: string;
    urlPattern: string;
  }> = [];

  schema.pages.forEach((page, pageIndex) => {
    page.steps.forEach((step, stepIndex) => {
      step.actions.forEach((action, actionIndex) => {
        if (action.do !== "waitForResponse") {
          return;
        }
        waitActions.push({
          pageClass: page.page_class,
          stepName: step.name,
          path: `pages[${pageIndex}].steps[${stepIndex}].actions[${actionIndex}].urlPattern`,
          urlPattern: action.urlPattern
        });
      });
    });
  });

  if (waitActions.length === 0) {
    return errors;
  }

  if (observed.length === 0) {
    const first = waitActions[0]!;
    errors.push(
      validationError(
        "waitforresponse_missing_observed",
        "observed_endpoints",
        `Step '${first.stepName}' in page '${first.pageClass}' uses waitForResponse but schema has no observed_endpoints.`,
        "Add top-level observed_endpoints with URL path substrings from ground (network requests seen on submit). Each waitForResponse urlPattern must match one entry.",
        '"observed_endpoints": ["/web/index.php/auth/validate"]'
      )
    );
    return errors;
  }

  for (const { stepName, path, urlPattern } of waitActions) {
    if (urlPatternMatchesObservedEndpoint(urlPattern, observed)) {
      continue;
    }
    const isDocPlaceholder = (DOCUMENTATION_WAITFORRESPONSE_PATTERNS as readonly string[]).includes(
      urlPattern
    );
    errors.push(
      validationError(
        isDocPlaceholder
          ? "waitforresponse_doc_placeholder"
          : "waitforresponse_unobserved_endpoint",
        path,
        isDocPlaceholder
          ? `waitForResponse urlPattern '${urlPattern}' is a documentation example, not an endpoint observed in ground.`
          : `waitForResponse urlPattern '${urlPattern}' in step '${stepName}' does not match any observed_endpoints entry.`,
        isDocPlaceholder
          ? "Replace with a path substring from ground (browser_read / recording). Do not copy illustrative endpoints from docs."
          : "Set urlPattern to a substring of a URL listed in observed_endpoints, or add the missing endpoint from ground.",
        isDocPlaceholder
          ? '"observed_endpoints": ["/your-app/real/auth-endpoint"], "urlPattern": "/your-app/real/auth-endpoint"'
          : '"observed_endpoints": ["/web/index.php/auth/validate"], "urlPattern": "/auth/validate"'
      )
    );
  }

  return errors;
}

/** generate.md documents `title: '[AC-n] should <verb> <outcome>'` for every spec — never
 * mechanically enforced before now, letting a generated title silently drop the prefix. */
function collectTitlePrefixError(testCase: TestCase, casePath: string): ValidationError[] {
  const expectedPrefix = `[${testCase.ac_id}]`;
  if (testCase.title.startsWith(expectedPrefix)) {
    return [];
  }
  return [
    validationError(
      "missing_ac_prefix",
      `${casePath}.title`,
      `Test case '${testCase.ac_id}' has title '${testCase.title}' which doesn't start with '${expectedPrefix}'.`,
      `Prefix the title with '${expectedPrefix}' (e.g. "${expectedPrefix} should log in").`,
      `"title": "${expectedPrefix} should log in"`
    )
  ];
}

export function collectCrossReferenceErrors(schema: FullSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const acIds = new Set<string>();

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

    testCase.body.forEach((bodyCall, callIndex) => {
      errors.push(
        ...collectBodyCallErrors(
          schema,
          `${casePath}.body[${callIndex}]`,
          bodyCall.fixture,
          bodyCall.call,
          bodyCall.args
        )
      );
    });
  });

  if (schema.spec.before_each !== null) {
    schema.spec.before_each.forEach((bodyCall, callIndex) => {
      errors.push(
        ...collectBodyCallErrors(
          schema,
          `spec.before_each[${callIndex}]`,
          bodyCall.fixture,
          bodyCall.call,
          bodyCall.args
        )
      );
    });
  }

  return errors;
}

export function validateFullSchema(schema: FullSchema, feature?: string): ValidationError[] {
  return [
    ...collectStructuralErrors(schema, feature !== undefined ? { feature } : undefined),
    ...collectExpectedDataErrors(schema),
    ...collectWaitForResponseErrors(schema),
    ...collectCrossReferenceErrors(schema)
  ];
}
