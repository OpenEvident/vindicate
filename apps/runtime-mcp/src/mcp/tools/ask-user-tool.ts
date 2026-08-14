/**
 * @file vindicate_ask_user — MCP elicitation with chat fallback (stateless).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logger } from "../../core/logger.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

type ElicitUnderlying = {
  elicitInput?: (params: unknown) => Promise<{ action: string; content?: Record<string, unknown> }>;
  getClientCapabilities?: () => { elicitation?: unknown } | undefined;
};

// Once the client declines, it will decline every time (e.g. Claude Code CLI has no form UI).
// Skip the round-trip for the rest of the session.
let elicitationClientDeclined = false;

/** Resets elicitation session state (for unit tests). */
export function resetElicitationSessionForTests(): void {
  elicitationClientDeclined = false;
}

/** Returns the underlying elicit-capable server, or null if elicitation is unavailable. */
function getElicitUnderlying(server: McpServer): ElicitUnderlying | null {
  if (elicitationClientDeclined) return null;
  const underlying = server.server as ElicitUnderlying;
  if (typeof underlying?.elicitInput !== "function") return null;
  const caps = underlying.getClientCapabilities?.();
  logger.info({ caps: caps ?? null }, "[MCP capabilities]");
  if (caps?.elicitation === undefined) return null;
  return underlying;
}

/** Attempt MCP elicitation for a finite choice list. Returns the selected value or null if
 *  elicitation is unsupported, declined, or cancelled. Never throws. */
async function tryElicitChoice(
  server: McpServer,
  message: string,
  choices: ReadonlyArray<{ readonly label: string; readonly value: string }>
): Promise<string | null> {
  try {
    const underlying = getElicitUnderlying(server);
    if (underlying === null) return null;

    const result = await underlying.elicitInput!({
      message,
      requestedSchema: {
        type: "object",
        properties: {
          choice: {
            type: "string",
            title: "Select an option",
            enum: choices.map((c) => c.value),
            enumNames: choices.map((c) => c.label)
          }
        },
        required: ["choice"]
      }
    });

    logger.info({ action: result.action, content: result.content }, "[elicit-choice] result");
    if (result.action === "accept" && typeof result.content?.["choice"] === "string") {
      return result.content["choice"];
    }
    if (result.action === "decline" || result.action === "cancel") {
      elicitationClientDeclined = true;
      logger.info("[elicit-choice] client declined — skipping elicitation for rest of session");
    }
    return null;
  } catch (err) {
    logger.warn({ err }, "[elicit-choice] elicitInput threw — falling back to agent message");
    return null;
  }
}

/** Attempt MCP elicitation for a free-text answer. Returns the entered string or null if
 *  elicitation is unsupported, declined, or cancelled. Never throws. */
async function tryElicitText(
  server: McpServer,
  message: string,
  context?: string
): Promise<string | null> {
  try {
    const underlying = getElicitUnderlying(server);
    if (underlying === null) return null;

    const result = await underlying.elicitInput!({
      message,
      requestedSchema: {
        type: "object",
        properties: {
          answer: {
            type: "string",
            title: "Your answer",
            ...(context !== undefined ? { description: context } : {})
          }
        },
        required: ["answer"]
      }
    });

    logger.info({ action: result.action, content: result.content }, "[elicit-text] result");
    if (result.action === "accept" && typeof result.content?.["answer"] === "string") {
      return result.content["answer"];
    }
    if (result.action === "decline" || result.action === "cancel") {
      elicitationClientDeclined = true;
      logger.info("[elicit-text] client declined — skipping elicitation for rest of session");
    }
    return null;
  } catch (err) {
    logger.warn({ err }, "[elicit-text] elicitInput threw — falling back to agent message");
    return null;
  }
}

export function registerAskUserTool(server: McpServer): void {
  server.registerTool(
    "vindicate_ask_user",
    {
      description:
        "Ask the user one question during an Vindicate workflow. When options are provided, shows a native picker UI. One question at a time — never batch.",
      inputSchema: {
        question: z.string().min(1).max(1024).describe("The question to ask the user"),
        options: z
          .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
          .min(2)
          .max(5)
          .optional()
          .describe("Finite choices for a picker. Omit for open-text questions."),
        context: z.string().max(128).optional().describe("One-sentence hint for why this is needed")
      }
    },
    async (args) => {
      try {
        if (args.options !== undefined && args.options.length >= 2) {
          const selected = await tryElicitChoice(server, args.question, args.options);
          if (selected !== null) {
            return toolJson({ answer: selected, answered_via: "ui_picker" });
          }

          return toolJson({
            question: args.question,
            options: args.options,
            answered_via: "agent_message",
            instruction:
              "Present this question and numbered options to the user. Wait for their reply before calling the next tool."
          });
        }

        const textAnswer = await tryElicitText(server, args.question, args.context);
        if (textAnswer !== null) {
          return toolJson({ answer: textAnswer, answered_via: "ui_input" });
        }

        return toolJson({
          question: args.question,
          answered_via: "agent_message",
          instruction:
            "Ask this question to the user. Wait for their reply before calling the next tool."
        });
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}
