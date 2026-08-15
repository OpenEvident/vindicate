import {
  deriveLocator,
  deriveLocatorHelperComment,
  deduplicateFieldNames,
  isDynamicElement
} from "./locator-derive.js";
import { pageAssertionUsesExpected } from "./expected-ref.js";
import type {
  Action,
  Assertion,
  ElementDescriptor,
  PageDef,
  Param,
  StepDef,
  TypeDef,
  VerifyDef
} from "./schema.js";

/**
 * Resolves an element ref to its locator expression. Static elements yield `this.<field>`;
 * dynamic (parameterized) elements yield `this.<method>(<refArgs>)`.
 */
type LocateFn = (ref: string, refArgs?: readonly string[]) => string;

function makeLocate(
  fieldMap: Map<string, string>,
  elementByRef: Map<string, ElementDescriptor>
): LocateFn {
  return (ref, refArgs) => {
    const field = fieldMap.get(ref) ?? ref;
    const el = elementByRef.get(ref);
    if (el !== undefined && isDynamicElement(el)) {
      return `this.${field}(${(refArgs ?? []).join(", ")})`;
    }
    return `this.${field}`;
  };
}

const HEADER_COMMENT =
  "// AUTO-GENERATED — edit this file directly; use vindicate_generate_code create/register_page for structural changes";

export function buildTypeDeclaration(t: TypeDef): string {
  const fields = t.fields.map((f) => `  ${f.name}: ${f.type};`).join("\n");
  return `export interface ${t.name} {\n${fields}\n}`;
}

function formatMatcherArg(arg: string | undefined): string {
  if (arg === undefined || arg.length === 0) {
    return "";
  }
  return arg;
}

function quoteTsString(value: string): string {
  return JSON.stringify(value);
}

function fillOrSelectValue(action: {
  value?: string | undefined;
  param?: string | undefined;
}): string {
  if (action.param !== undefined) {
    return action.param;
  }
  if (action.value !== undefined) {
    return quoteTsString(action.value);
  }
  return "undefined";
}

function actionToTs(action: Action, locate: LocateFn): string {
  switch (action.do) {
    case "navigate":
      return "await this.page.goto(this.path);";
    case "waitForPageLoad":
      return "await this.waitForPageLoad();";
    case "waitForURL":
      return `await this.page.waitForURL(${quoteTsString(action.pattern)}, { timeout: 15000 });`;
    case "waitForResponse":
      return `await this.page.waitForResponse(r => r.url().includes('${action.urlPattern}'));`;
    case "fill":
      return `await ${locate(action.ref, action.refArgs)}.fill(${fillOrSelectValue(action)});`;
    case "type": {
      // clear_first emits a second statement; the caller only indents the first line of what we
      // return (buildStepMethod prefixes once), so the embedded newline carries its own indent.
      const clear =
        action.clear_first === true
          ? `await ${locate(action.ref, action.refArgs)}.clear();\n    `
          : "";
      return `${clear}await ${locate(action.ref, action.refArgs)}.pressSequentially(${fillOrSelectValue(action)});`;
    }
    case "click":
      return `await ${locate(action.ref, action.refArgs)}.click();`;
    case "click_if_visible": {
      const timeoutArg = action.timeout !== undefined ? `, ${action.timeout}` : "";
      return `await this.clickIfVisible(${locate(action.ref, action.refArgs)}${timeoutArg});`;
    }
    case "hover":
      return `await ${locate(action.ref, action.refArgs)}.hover();`;
    case "check":
      return `await ${locate(action.ref, action.refArgs)}.check();`;
    case "uncheck":
      return `await ${locate(action.ref, action.refArgs)}.uncheck();`;
    case "select":
      return `await ${locate(action.ref, action.refArgs)}.selectOption(${fillOrSelectValue(action)});`;
    case "press":
      return `await this.page.keyboard.press('${action.key}');`;
    case "upload": {
      const files = action.files.map((f) => `'${f}'`).join(", ");
      return `await ${locate(action.ref, action.refArgs)}.setInputFiles([${files}]);`;
    }
    case "dblclick":
      return `await ${locate(action.ref, action.refArgs)}.dblclick();`;
    case "drag": {
      const nativeOpt = action.strategy === "native" ? ", { native: true }" : "";
      return `await this.dragTo(${locate(action.ref, action.refArgs)}, ${locate(action.toRef, action.toRefArgs)}${nativeOpt});`;
    }
    case "scroll":
      return `await ${locate(action.ref, action.refArgs)}.scrollIntoViewIfNeeded();`;
    case "accept_dialog":
      return "this.page.on('dialog', d => d.accept());";
    case "dismiss_dialog":
      return "this.page.on('dialog', d => d.dismiss());";
  }
}

function assertionToLines(assertion: Assertion, locate: LocateFn): string[] {
  const arg = formatMatcherArg(assertion.arg);
  if (assertion.subject === "page") {
    return [`await expect(this.page).${assertion.matcher}(${arg});`];
  }
  const loc = locate(assertion.ref, assertion.refArgs);
  const assertLine = `await expect(${loc}).${assertion.matcher}(${arg});`;
  if (assertion.waitFor !== undefined) {
    return [`await ${loc}.waitFor({ state: '${assertion.waitFor}' });`, assertLine];
  }
  return [assertLine];
}

function paramJsDocDescription(param: Param): string {
  const label = param.name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
  return `${label} (${param.type})`;
}

function buildMethodJsDoc(summary: string, params: readonly Param[]): string {
  const lines = ["  /**", `   * ${summary}`];
  for (const p of params) {
    lines.push(`   * @param ${p.name} - ${paramJsDocDescription(p)}`);
  }
  lines.push("   * @returns this for chaining");
  lines.push("   */");
  return lines.join("\n");
}

function buildStepMethod(step: StepDef, locate: LocateFn, isPanel: boolean): string {
  const params = step.params.map((p: Param) => `${p.name}: ${p.type}`).join(", ");
  const actionLines = step.actions
    .filter((a) => !(isPanel && a.do === "navigate"))
    .map((a) => `    ${actionToTs(a, locate)}`)
    .join("\n");
  return [
    buildMethodJsDoc(step.jsdoc, step.params),
    `  async ${step.name}(${params}): Promise<this> {`,
    actionLines,
    `    return this;`,
    `  }`
  ].join("\n");
}

function buildVerifyMethod(verify: VerifyDef, locate: LocateFn): string {
  const params = verify.params.map((p: Param) => `${p.name}: ${p.type}`).join(", ");
  const assertionLines = verify.assertions
    .flatMap((a) => assertionToLines(a, locate))
    .map((line) => `    ${line}`)
    .join("\n");
  return [
    buildMethodJsDoc(verify.jsdoc, verify.params),
    `  async ${verify.name}(${params}): Promise<this> {`,
    assertionLines,
    `    return this;`,
    `  }`
  ].join("\n");
}

export interface BuildPageObjectOptions {
  /** Barrel export name (e.g. authExpected) when verify assertions reference expected.* */
  readonly expectedBarrelExport?: string | undefined;
}

export function buildPageObject(page: PageDef, options?: BuildPageObjectOptions): string {
  const isPanel = page.is_panel === true;
  const baseClass = isPanel ? "BasePanel" : "BasePage";
  const baseImportPath = isPanel ? "./BasePanel" : "./BasePage";

  const fieldMap = deduplicateFieldNames(page.elements);
  const elementByRef = new Map(page.elements.map((e) => [e.ref, e]));
  const locate = makeLocate(fieldMap, elementByRef);

  const typeDeclarations =
    page.types.length > 0 ? `${page.types.map(buildTypeDeclaration).join("\n\n")}\n\n` : "";

  const hasDynamic = page.elements.some(isDynamicElement);

  const locatorLines = page.elements.flatMap((el) => {
    const fieldName = fieldMap.get(el.ref) ?? el.ref;
    const locator = deriveLocator(el);
    const strategy = deriveLocatorHelperComment(el);
    if (isDynamicElement(el)) {
      const params = (el.dynamic ?? []).map((p) => `${p.name}: ${p.type}`).join(", ");
      return [
        `  // locator-helper: ${strategy}`,
        `  private ${fieldName}(${params}): Locator {`,
        `    return ${locator};`,
        `  }`
      ];
    }
    return [`  // locator-helper: ${strategy}`, `  private ${fieldName} = ${locator};`];
  });

  const stepMethods = page.steps.map((s) => buildStepMethod(s, locate, isPanel)).join("\n\n");
  const verifyMethods = page.verifies.map((v) => buildVerifyMethod(v, locate)).join("\n\n");

  const pathLine = isPanel ? "" : `  readonly path = '${page.path ?? "/"}';`;
  const needsExpect = page.verifies.length > 0;
  const needsExpectedImport =
    options?.expectedBarrelExport !== undefined && pageAssertionUsesExpected(page);

  const playwrightImports = [
    ...(needsExpect ? ["expect"] : []),
    ...(hasDynamic ? ["Locator"] : [])
  ];

  const imports = [
    `import { ${baseClass} } from '${baseImportPath}';`,
    ...(needsExpectedImport
      ? [`import { ${options.expectedBarrelExport} as expected } from '@config/page-loader';`]
      : []),
    ...(playwrightImports.length > 0
      ? [`import { ${playwrightImports.join(", ")} } from '@playwright/test';`]
      : [])
  ].join("\n");

  const parts = [
    HEADER_COMMENT.replace("{feature}", page.feature),
    imports,
    "",
    typeDeclarations.trimEnd(),
    typeDeclarations.length > 0 ? "" : undefined,
    `export class ${page.page_class} extends ${baseClass} {`,
    pathLine,
    pathLine ? "" : undefined,
    "  // ── Locators ──────────────────────────────────────────────────────────",
    ...locatorLines,
    "",
    "  // ── Steps ──────────────────────────────────────────────────────────────",
    stepMethods,
    "",
    "  // ── Verifies ───────────────────────────────────────────────────────────",
    verifyMethods,
    "}"
  ].filter((l): l is string => l !== undefined);

  return `${parts.join("\n")}\n`;
}
