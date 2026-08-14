import { describe, expect, it } from "vitest";

import { ELICITATION_SCHEMAS } from "../../src/mcp/elicitation/schemas.js";

function enumFields(schema: Record<string, unknown>): Array<{ key: string; enums: string[] }> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return [];
  return Object.entries(props)
    .filter(([, v]) => Array.isArray(v.enum))
    .map(([key, v]) => ({ key, enums: v.enum as string[] }));
}

describe("elicitation schemas", () => {
  it("includes bootstrap and CI intake schemas", () => {
    const ids = ELICITATION_SCHEMAS.map((s) => s.id);
    expect(ids).toContain("bootstrap-intake");
    expect(ids).toContain("ci-setup-intake");
    expect(ids).not.toContain("design-approval");
  });

  it("all enum fields except CI platform include an other option", () => {
    for (const entry of ELICITATION_SCHEMAS) {
      for (const { key, enums } of enumFields(entry.schema)) {
        if (entry.id === "ci-setup-intake" && key === "ciPlatform") {
          expect(enums).toEqual(["github", "bitbucket"]);
          continue;
        }
        expect(enums, `${entry.id}.${key}`).toContain("other");
      }
    }
  });
});
