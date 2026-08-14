import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import { VINDICATE_RULE_BODY } from "./vindicateRuleContent.js";

export interface ICopilotInstructionsWriter {
  write(workspaceFolderPath: string): Promise<RuleWriteResult>;
  isConfigured(workspaceFolderPath: string): Promise<boolean>;
}

export type RuleWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

const COPILOT_INSTRUCTIONS_FILE = "copilot-instructions.md";

const VINDICATE_COPILOT_MARKERS = {
  start: "<!-- vindicate:start -->",
  end: "<!-- vindicate:end -->"
} as const;

export class CopilotInstructionsWriter implements ICopilotInstructionsWriter {
  constructor(private readonly logger: ILogger) {}

  async isConfigured(workspaceFolderPath: string): Promise<boolean> {
    try {
      const content = await readFile(instructionsPath(workspaceFolderPath), "utf8");
      return content.includes(VINDICATE_COPILOT_MARKERS.start);
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string): Promise<RuleWriteResult> {
    try {
      const filePath = instructionsPath(workspaceFolderPath);
      const block = buildCopilotBlock();

      let content = "";
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${block}\n`, "utf8");
        return { ok: true, alreadyPresent: false };
      }

      if (content.includes(VINDICATE_COPILOT_MARKERS.start)) {
        const updated = replaceVindicateBlock(content, block);
        if (updated === content) {
          return { ok: true, alreadyPresent: true };
        }
        await writeFile(filePath, updated, "utf8");
        return { ok: true, alreadyPresent: false };
      }

      await writeFile(filePath, `${content.trimEnd()}\n\n${block}\n`, "utf8");
      return { ok: true, alreadyPresent: false };
    } catch (err) {
      this.logger.error("copilot-instructions.md write failed", err);
      return { ok: false, error: String(err) };
    }
  }
}

function instructionsPath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, ".github", COPILOT_INSTRUCTIONS_FILE);
}

function buildCopilotBlock(): string {
  return `${VINDICATE_COPILOT_MARKERS.start}\n${VINDICATE_RULE_BODY}\n${VINDICATE_COPILOT_MARKERS.end}`;
}

function replaceVindicateBlock(content: string, block: string): string {
  const start = content.indexOf(VINDICATE_COPILOT_MARKERS.start);
  const end = content.indexOf(VINDICATE_COPILOT_MARKERS.end);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const afterEnd = end + VINDICATE_COPILOT_MARKERS.end.length;
  return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
}
