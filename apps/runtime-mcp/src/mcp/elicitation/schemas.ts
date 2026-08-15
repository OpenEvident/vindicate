/**
 * @file JSON Schema definitions for Vindicate intake and approval gates.
 */

export interface ElicitationSchema {
  readonly id: string;
  readonly title: string;
  readonly schema: Record<string, unknown>;
}

export const ELICITATION_SCHEMAS: readonly ElicitationSchema[] = [
  {
    id: "bootstrap-intake",
    title: "Project setup",
    schema: {
      title: "Project setup",
      type: "object",
      properties: {
        baseUrl: { type: "string", title: "App URL (e.g. http://localhost:3000)" },
        target: {
          type: "string",
          enum: ["ui", "api", "both"],
          title: "What should Vindicate scaffold?"
        },
        authRequired: { type: "boolean", title: "Does the app require login?" },
        authStrategy: {
          type: "string",
          enum: ["session", "token", "oauth", "none", "other"],
          title: "Auth type"
        },
        authStrategyCustom: { type: "string", title: "Describe your approach:" },
        loginUrl: { type: "string", title: "Login page URL", default: "/login" }
      },
      required: ["baseUrl", "target", "authRequired", "authStrategy"]
    }
  },
  {
    id: "ci-setup-intake",
    title: "CI platform",
    schema: {
      title: "CI platform",
      type: "object",
      properties: {
        ciPlatform: {
          type: "string",
          enum: ["github", "bitbucket"],
          title: "Which CI platform?"
        },
        ciPlatformCustom: { type: "string", title: "Describe your CI setup:" },
        action: {
          type: "string",
          enum: ["create", "replace", "update", "other"],
          title: "CI file already exists — what should I do?"
        },
        actionCustom: { type: "string", title: "Describe what you want:" }
      },
      required: ["ciPlatform", "action"]
    }
  }
] as const;

const byId = new Map(ELICITATION_SCHEMAS.map((s) => [s.id, s]));

export function getElicitationSchema(id: string): ElicitationSchema | undefined {
  return byId.get(id);
}
