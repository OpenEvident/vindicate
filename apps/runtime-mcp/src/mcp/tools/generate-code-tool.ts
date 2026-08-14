import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runApiGenerator } from "../../codegen/api-generator.js";
import {
  ApiFullSchemaSchema,
  ApiTestCaseSchema,
  ClientDefSchema,
  GenerateApiCodeInputSchema,
  type GenerateApiCodeInput
} from "../../codegen/api-schema.js";
import { runGenerator } from "../../codegen/generator.js";
import {
  FullSchemaSchema,
  GenerateCodeInputSchema,
  PageDefSchema,
  TestCaseSchema
} from "../../codegen/schema.js";
import { zodErrorToCodegenError } from "../../codegen/validation.js";
import { zodIssuesToValidationErrors } from "../../codegen/validate-codegen.js";
import { finalizeValidationResult } from "../../codegen/validation-errors.js";
import type { ProjectFs } from "../../fs/project-fs.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

// One discriminated union spanning both UI and API modes — the two schema files stay independent
// (schema.ts knows nothing of api-schema.ts and vice versa); this tool is the single place that
// composes them, exactly the design intent api-schema.ts's mode literals were chosen for (globally
// unique literals across both unions, verified to combine via z.discriminatedUnion's own .options).
const CombinedGenerateCodeInputSchema = z.discriminatedUnion("mode", [
  ...GenerateCodeInputSchema.options,
  ...GenerateApiCodeInputSchema.options
]);

const API_MODES = new Set<string>(["validate_api", "create_api", "add_api_test_cases", "register_client"]);

function isApiInput(
  data: z.infer<typeof GenerateCodeInputSchema> | GenerateApiCodeInput
): data is GenerateApiCodeInput {
  return API_MODES.has(data.mode);
}

export function registerGenerateCodeTool(server: McpServer, projectFs: ProjectFs): void {
  server.registerTool(
    "vindicate_generate_code",
    {
      description:
        "Generates conformant Playwright TypeScript for new test code. UI modes: `validate` (dry-run for `create` only), `create` (new feature once, guarded against clobber unless `overwrite:true`), `add_test_cases` (append tests), `register_page` (add one page and wire loader/config lines only). API modes: `validate_api` (dry-run for `create_api` only), `create_api` (new feature once: resource client(s), builders, spec, `expected.json`, auth-setup fixtures), `add_api_test_cases` (append tests), `register_client` (add one resource client and wire barrel/config lines only). Use codegen for structure-critical creation and edit existing `.ts` directly for other changes. UI locators must come from `browser_read`; API endpoint shapes come from `ground`'s `api-ingest`. Run `npm run audit` after mutating modes.",
      inputSchema: {
        mode: z
          .enum([
            "validate",
            "create",
            "add_test_cases",
            "register_page",
            "validate_api",
            "create_api",
            "add_api_test_cases",
            "register_client"
          ])
          .describe(
            "Required. Which field(s) below are required depends on mode: " +
              "'validate'/'validate_api' need validateTarget + schema (dry-run, writes nothing); " +
              "'create'/'create_api' need schema (schema is the FULL FullSchema/ApiFullSchema object — " +
              "{ pages/clients, spec, expected? } — nested under 'schema', not spread at top level); " +
              "'add_test_cases'/'add_api_test_cases' need feature + cases; " +
              "'register_page' needs feature + page; 'register_client' needs feature + client."
          ),
        validateTarget: z
          .enum(["create", "create_api"])
          .optional()
          .describe("Required for mode 'validate'/'validate_api' only — which real op this is a dry-run for. Always 'create' or 'create_api', never any other mode."),
        feature: z
          .string()
          .min(1)
          .optional()
          .describe("The feature slug (lowercase noun). Required for every mode except 'validate'/'validate_api', where it's still recommended so the 'feature already exists' guard can be dry-run too."),
        schema: z
          .union([FullSchemaSchema, ApiFullSchemaSchema])
          .optional()
          .describe("Required for 'validate'/'create' (UI: FullSchema) or 'validate_api'/'create_api' (API: ApiFullSchema). The full inline schema object — see ref-codegen-schema.md / ref-api-codegen-schema.md."),
        overwrite: z.boolean().optional().describe("Only honored by 'create'/'create_api' — allows re-running create against a feature that already has files. Omit/false is the safe default."),
        cases: z
          .union([z.array(TestCaseSchema), z.array(ApiTestCaseSchema)])
          .optional()
          .describe("Required for 'add_test_cases' (TestCase[]) / 'add_api_test_cases' (ApiTestCase[]) — the new test case(s) to append."),
        page: PageDefSchema.optional().describe("Required for 'register_page' — one page object definition (same shape as one entry in schema.pages[])."),
        client: ClientDefSchema.optional().describe("Required for 'register_client' — one resource client definition (same shape as one entry in schema.clients[]).")
      },
      annotations: { destructiveHint: true }
    },
    async (args) => {
      try {
        const parsed = CombinedGenerateCodeInputSchema.safeParse(args);
        if (!parsed.success) {
          const allErrors = zodIssuesToValidationErrors(parsed.error);
          const result = finalizeValidationResult(allErrors);
          if (args.mode === "validate" || args.mode === "validate_api") {
            return toolJson({
              ok: true,
              valid: result.valid,
              errors: result.errors,
              errorCount: result.errorCount,
              truncated: result.truncated,
              message: result.valid
                ? "Input shape is valid."
                : `Input shape has ${result.errorCount} error(s). Fix before validating schema content.`,
              ...(result.valid
                ? {}
                : {
                    instruction:
                      "Fix every error in errors[] in the schema JSON, then call this same mode again. " +
                      "Do not write the page/client/spec/fixture files by hand instead of fixing the schema."
                  })
            });
          }
          const err = zodErrorToCodegenError(parsed.error);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "schema_validation",
                    field: err.field,
                    message: err.validationMessage,
                    fix: err.fix,
                    ...(allErrors.length > 1
                      ? {
                          additionalErrors: allErrors.length - 1,
                          hint: "Use mode:'validate'/'validate_api' to list all errors at once."
                        }
                      : {}),
                    instruction:
                      "Fix this field in the schema JSON and retry the same vindicate_generate_code call. " +
                      "Do not write the page/client/spec/fixture files by hand instead — codegen wires " +
                      "required scaffolding (barrels, config fixtures, expected.json) atomically, and a " +
                      "direct file write will not reproduce that correctly."
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        if (parsed.data.mode === "validate") {
          const result = await runGenerator(projectFs, parsed.data);
          if (!("valid" in result)) {
            throw new Error("validate mode did not return ValidationResult");
          }
          return toolJson({
            ok: true,
            valid: result.valid,
            errors: result.errors,
            errorCount: result.errorCount,
            truncated: result.truncated,
            message: result.valid
              ? "Schema is valid. Safe to call mode:'create'."
              : `Found ${result.errorCount} validation error(s). Fix all listed errors, re-validate, then create.`,
            ...(result.valid
              ? {}
              : {
                  instruction:
                    "Fix every error in errors[] in the schema JSON, then call mode:'validate' again. " +
                    "Do not write the page/spec/fixture files by hand instead of fixing the schema — " +
                    "'create' wires required scaffolding (barrels, config fixtures, expected.json) atomically."
                })
          });
        }

        if (parsed.data.mode === "validate_api") {
          const result = await runApiGenerator(projectFs, parsed.data);
          if (!("valid" in result)) {
            throw new Error("validate_api mode did not return ValidationResult");
          }
          return toolJson({
            ok: true,
            valid: result.valid,
            errors: result.errors,
            errorCount: result.errorCount,
            truncated: result.truncated,
            message: result.valid
              ? "Schema is valid. Safe to call mode:'create_api'."
              : `Found ${result.errorCount} validation error(s). Fix all listed errors, re-validate, then create_api.`,
            ...(result.valid
              ? {}
              : {
                  instruction:
                    "Fix every error in errors[] in the schema JSON, then call mode:'validate_api' again. " +
                    "Do not write the client/spec/fixture files by hand instead of fixing the schema — " +
                    "'create_api' wires required scaffolding (barrels, config fixtures, expected.json) atomically."
                })
          });
        }

        const result = isApiInput(parsed.data)
          ? await runApiGenerator(projectFs, parsed.data)
          : await runGenerator(projectFs, parsed.data);
        if ("valid" in result) {
          throw new Error("unexpected ValidationResult from mutating mode");
        }

        return toolJson({
          ok: true,
          filesWritten: result.filesWritten,
          message: `Generated ${result.filesWritten.length} file(s). Run npm run audit to verify types.`,
          ...(result.notice !== undefined ? { notice: result.notice } : {})
        });
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

