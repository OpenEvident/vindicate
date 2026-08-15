/**
 * @file vindicate_design — stateless test design submission with diff badges.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { diffDesign } from "../../harness/design-state.js";
import { APP_RESOURCE_URI } from "../resources/vindicate-app-resource.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

const suiteSchema = z.object({
  title: z.string().min(1).describe("The test.describe() title, e.g. 'Acme - Auth' (App - Area)."),
  cases: z
    .array(
      z.object({
        title: z
          .string()
          .min(1)
          .describe(
            'The full test() title, e.g. "[AC-1] should log in with valid credentials" — starts with the [AC-n] tag.'
          )
      })
    )
    .describe("One entry per agreed testcase/AC, in the order they'll appear in the spec.")
});

const previousSchema = z.object({
  suites: z
    .array(suiteSchema)
    .describe(
      "The prior call's suites, unchanged, used only to diff against the new suites for add/modify/remove badges."
    )
});

export function registerDesignTool(server: McpServer): void {
  registerAppTool(
    server,
    "vindicate_design",
    {
      description:
        "Submits the full test design (suites, cases, write plan) and returns the design-approval panel. " +
        "Pass previous when editing so added/modified/removed badges are computed.",
      inputSchema: {
        suites: z
          .array(suiteSchema)
          .max(50)
          .describe(
            "Required. The full agreed test design: [{ title: '<App> - <Area>', cases: [{ title: '[AC-n] should ...' }] }]. " +
              "Always the complete current set, not a delta — this replaces (not merges with) any prior suites."
          ),
        write_plan: z
          .string()
          .max(512)
          .optional()
          .describe(
            "Optional one-paragraph summary of the write plan (target spec, write_new|edit_append, count) shown in the panel."
          ),
        previous: previousSchema
          .optional()
          .describe(
            "Optional. Pass the prior call's { suites } when re-submitting an edited design, so added/modified/removed badges are computed against it."
          )
      },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI } }
    },
    (args) => {
      try {
        const badges = diffDesign(args.previous?.suites, args.suites);
        return toolJson({
          view: "design-approval",
          suites: args.suites,
          ...(args.write_plan !== undefined ? { write_plan: args.write_plan } : {}),
          badges
        });
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}
