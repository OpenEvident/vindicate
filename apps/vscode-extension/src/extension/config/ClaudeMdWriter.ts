import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import { buildClaudeMdBlock, VINDICATE_CLAUDE_MARKERS } from "./vindicateRuleContent.js";

export interface IClaudeMdWriter {
  write(workspaceFolderPath: string): Promise<RuleWriteResult>;
  isConfigured(workspaceFolderPath: string): Promise<boolean>;
}

export type RuleWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

const CLAUDE_MD = "CLAUDE.md";

export class ClaudeMdWriter implements IClaudeMdWriter {
  constructor(private readonly logger: ILogger) {}

  async isConfigured(workspaceFolderPath: string): Promise<boolean> {
    try {
      const content = await readFile(claudePath(workspaceFolderPath), "utf8");
      return content.includes(VINDICATE_CLAUDE_MARKERS.start);
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string): Promise<RuleWriteResult> {
    try {
      const filePath = claudePath(workspaceFolderPath);
      const block = buildClaudeMdBlock();
      let content = "";
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        await writeFile(filePath, `${block}\n`, "utf8");
        return { ok: true, alreadyPresent: false };
      }

      if (content.includes(VINDICATE_CLAUDE_MARKERS.start)) {
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
      this.logger.error("CLAUDE.md write failed", err);
      return { ok: false, error: String(err) };
    }
  }
}

function claudePath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, CLAUDE_MD);
}

function replaceVindicateBlock(content: string, block: string): string {
  const start = content.indexOf(VINDICATE_CLAUDE_MARKERS.start);
  const end = content.indexOf(VINDICATE_CLAUDE_MARKERS.end);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const afterEnd = end + VINDICATE_CLAUDE_MARKERS.end.length;
  return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
}
