import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import { VINDICATE_RULE_MDC } from "./vindicateRuleContent.js";

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
      await access(rulePath(workspaceFolderPath));
      return true;
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string): Promise<RuleWriteResult> {
    try {
      const filePath = rulePath(workspaceFolderPath);
      let alreadyPresent = false;
      try {
        await access(filePath);
        alreadyPresent = true;
      } catch {
        /* create */
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, VINDICATE_RULE_MDC, "utf8");
      return { ok: true, alreadyPresent };
    } catch (err) {
      this.logger.error("Cursor rule write failed", err);
      return { ok: false, error: String(err) };
    }
  }
}

function rulePath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, ".cursor", "rules", RULE_FILENAME);
}
