/**
 * @file MCP resources exposing JSON Schema for Cursor elicitation forms.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ELICITATION_SCHEMAS, getElicitationSchema } from "../elicitation/schemas.js";

const template = new ResourceTemplate("vindicate://elicitation/{schemaId}", { list: undefined });

export function registerElicitationResources(server: McpServer): void {
  server.registerResource(
    "vindicate_elicitation",
    template,
    {
      description: "JSON Schema for structured intake and approval gates",
      mimeType: "application/schema+json"
    },
    (uri, variables) => {
      const schemaId = String(variables.schemaId ?? "");
      const entry = getElicitationSchema(schemaId);
      if (entry === undefined) {
        throw new Error(`Unknown elicitation schema: ${schemaId}`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/schema+json",
            text: JSON.stringify(entry.schema, null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    "vindicate_elicitation_index",
    "vindicate://elicitation",
    {
      description: "Index of Vindicate elicitation schema ids",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            ELICITATION_SCHEMAS.map((s) => ({
              id: s.id,
              title: s.title,
              uri: `vindicate://elicitation/${s.id}`
            })),
            null,
            2
          )
        }
      ]
    })
  );
}
