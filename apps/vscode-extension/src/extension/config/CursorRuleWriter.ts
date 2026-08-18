import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import {
  buildCursorMdcBlock,
  buildCursorMdcFile,
  VINDICATE_CURSOR_MARKERS
} from "./vindicateRuleContent.js";

export interface ICursorRuleWriter {
  write(workspaceFolderPath: string): Promise<RuleWriteResult>;
  isConfigured(workspaceFolderPath: string): Promise<boolean>;
}

export type RuleWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

const RULE_FILENAME = "vindicate.mdc";

export class CursorRuleWriter implements ICursorRuleWriter {
  constructor(private readonly logger: ILogger) {}

  async isConfigured(workspaceFolderPath: string): Promise<boolean> {
    try {
      const content = await readFile(rulePath(workspaceFolderPath), "utf8");
      return content.includes(VINDICATE_CURSOR_MARKERS.start);
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string): Promise<RuleWriteResult> {
    try {
      const filePath = rulePath(workspaceFolderPath);
      const block = buildCursorMdcBlock();

      let content = "";
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${buildCursorMdcFile()}\n`, "utf8");
        return { ok: true, alreadyPresent: false };
      }

      if (content.includes(VINDICATE_CURSOR_MARKERS.start)) {
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
      this.logger.error("Cursor rule write failed", err);
      return { ok: false, error: String(err) };
    }
  }
}

function rulePath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, ".cursor", "rules", RULE_FILENAME);
}

function replaceVindicateBlock(content: string, block: string): string {
  const start = content.indexOf(VINDICATE_CURSOR_MARKERS.start);
  const end = content.indexOf(VINDICATE_CURSOR_MARKERS.end);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const afterEnd = end + VINDICATE_CURSOR_MARKERS.end.length;
  return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
}
