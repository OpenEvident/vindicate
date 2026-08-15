/**
 * Parity guard — worker live gesture lists must stay aligned.
 *
 * Adding a new gesture checklist:
 * 1. interaction.params step schema + interaction.handlers
 * 2. command-executor switch + SETTLE_AFTER_ACTIONS
 * 3. capabilities.routes BROWSER_ACTIONS
 * 4. browser_act enum + buildWorkerStep (runtime-mcp)
 * 5. codegen ActionSchema + page-object actionToTs + validate-codegen toRef
 * 6. protocol RecordedStepSchema.action + target/files fields
 * 7. agent-step-builder RECORDABLE_ACTIONS + COMMAND_TO_RECORDED_ACTION
 * 8. recording-playback.service cases + SETTLE_ACTIONS
 * 9. recording-capture.evaluate human recorder events
 * 10. recording.types in-flight payloads
 * 11. extension ActionType + ACTION_META + ACTION_ICONS + StepCard
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RecordedStepSchema } from "@vindicate/protocol";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readWorkerSource(rel: string): string {
  return readFileSync(path.join(workerRoot, rel), "utf8");
}

function schemaActionLiterals(source: string): string[] {
  const matches = source.matchAll(/action: z\.literal\("([^"]+)"\)/g);
  return [...matches].map((m) => m[1]!);
}

describe("worker gesture parity", () => {
  const paramsSource = readWorkerSource("src/services/browser/interactions/interaction.params.ts");
  const executorSource = readWorkerSource("src/services/browser/commands/command-executor.ts");
  const capabilitiesSource = readWorkerSource("src/health/capabilities.routes.ts");
  const agentSource = readWorkerSource("src/services/browser/recording/agent-step-builder.ts");
  const playbackSource = readWorkerSource(
    "src/services/browser/recording/recording-playback.service.ts"
  );

  const schemaActions = new Set(schemaActionLiterals(paramsSource));
  const recordedActions = new Set(RecordedStepSchema.shape.action.options);

  it("every interaction.params action has a command-executor case and capability entry", () => {
    for (const action of schemaActions) {
      expect(executorSource).toContain(`case "${action}"`);
      expect(capabilitiesSource).toContain(`"${action}"`);
    }
  });

  it("every RECORDABLE_ACTIONS entry is in protocol RecordedStepSchema and playback switch", () => {
    const recordableMatch = agentSource.match(/RECORDABLE_ACTIONS = new Set\(\[([\s\S]*?)\]\)/);
    expect(recordableMatch).not.toBeNull();
    const recordable = [...(recordableMatch?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    for (const action of recordable) {
      expect(
        recordedActions.has(action as (typeof RecordedStepSchema.shape.action.options)[number])
      ).toBe(true);
      if (action !== "upload_file") {
        expect(playbackSource).toContain(`case "${action}"`);
      }
    }
  });
});
