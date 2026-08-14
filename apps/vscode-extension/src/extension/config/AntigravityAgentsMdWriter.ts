import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import { buildAgentsMdBlock, VINDICATE_AGENTS_MARKERS } from "./vindicateRuleContent.js";

export interface IAntigravityAgentsMdWriter {
  write(workspaceFolderPath: string): Promise<RuleWriteResult>;
  isConfigured(workspaceFolderPath: string): Promise<boolean>;
}

export type RuleWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

const AGENTS_DIR = ".agents";
const AGENTS_MD_FILE = "AGENTS.md";

/** Writes Vindicate's always-on rules to Antigravity's `.agents/AGENTS.md` — confirmed live against the
 * official docs (antigravity.google/docs/mcp names the same `.agents/` folder for MCP config; the
 * skills docs confirm `.agents/skills/`; a direct query to Antigravity itself confirmed AGENTS.md is
 * the always-on rules file, inside that same root). Marker-based merge mirrors ClaudeMdWriter.ts —
 * AGENTS.md is a general-purpose file a user may already have other content in. */
export class AntigravityAgentsMdWriter implements IAntigravityAgentsMdWriter {
  constructor(private readonly logger: ILogger) {}

  async isConfigured(workspaceFolderPath: string): Promise<boolean> {
    try {
      const content = await readFile(agentsMdPath(workspaceFolderPath), "utf8");
      return content.includes(VINDICATE_AGENTS_MARKERS.start);
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string): Promise<RuleWriteResult> {
    try {
      const filePath = agentsMdPath(workspaceFolderPath);
      const block = buildAgentsMdBlock();
      await mkdir(path.dirname(filePath), { recursive: true });

      let content = "";
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        await writeFile(filePath, `${block}\n`, "utf8");
        return { ok: true, alreadyPresent: false };
      }

      if (content.includes(VINDICATE_AGENTS_MARKERS.start)) {
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
      this.logger.error("AGENTS.md write failed", err);
      return { ok: false, error: String(err) };
    }
  }
}

function agentsMdPath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, AGENTS_DIR, AGENTS_MD_FILE);
}

function replaceVindicateBlock(content: string, block: string): string {
  const start = content.indexOf(VINDICATE_AGENTS_MARKERS.start);
  const end = content.indexOf(VINDICATE_AGENTS_MARKERS.end);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const afterEnd = end + VINDICATE_AGENTS_MARKERS.end.length;
  return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
}
