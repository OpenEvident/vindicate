import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ILogger } from "../shared/logger";
import type { McpToolName } from "../shared/types";

export interface IAgentSkillWriter {
  write(workspaceFolderPath: string, tool: McpToolName): Promise<SkillWriteResult>;
  isConfigured(workspaceFolderPath: string, tool: McpToolName): Promise<boolean>;
}

export type SkillWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

const SKILL_DIR = "vindicate";
const SKILL_FILENAME = "SKILL.md";
const COMMUNICATION_FILENAME = "communication.md";

export class AgentSkillWriter implements IAgentSkillWriter {
  constructor(
    private readonly logger: ILogger,
    private readonly extensionPath: string
  ) {}

  async isConfigured(workspaceFolderPath: string, tool: McpToolName): Promise<boolean> {
    try {
      const skillPath = this.skillFilePath(workspaceFolderPath, tool);
      await access(skillPath);
      return true;
    } catch {
      return false;
    }
  }

  async write(workspaceFolderPath: string, tool: McpToolName): Promise<SkillWriteResult> {
    try {
      const targets = this.targetPaths(workspaceFolderPath, tool);
      if (targets.length === 0) {
        return { ok: true, alreadyPresent: false };
      }

      const skillBody = await readFile(
        path.join(this.extensionPath, "resources", "skill", SKILL_FILENAME),
        "utf8"
      );
      const communicationBody = await readFile(
        path.join(this.extensionPath, "resources", "skill", COMMUNICATION_FILENAME),
        "utf8"
      );

      let alreadyPresent = false;
      for (const target of targets) {
        try {
          await access(target.skillPath);
          alreadyPresent = true;
        } catch {
          /* create */
        }
        await mkdir(path.dirname(target.skillPath), { recursive: true });
        await writeFile(target.skillPath, skillBody, "utf8");
        if (target.communicationPath !== undefined) {
          await mkdir(path.dirname(target.communicationPath), { recursive: true });
          await writeFile(target.communicationPath, communicationBody, "utf8");
        }
      }
      return { ok: true, alreadyPresent };
    } catch (err) {
      this.logger.error("Agent skill write failed", err);
      return { ok: false, error: String(err) };
    }
  }

  private skillFilePath(workspaceFolderPath: string, tool: McpToolName): string {
    const targets = this.targetPaths(workspaceFolderPath, tool);
    if (targets.length === 0) {
      return path.join(workspaceFolderPath, ".cursor", "skills", SKILL_DIR, SKILL_FILENAME);
    }
    return targets[0]!.skillPath;
  }

  private targetPaths(
    workspaceFolderPath: string,
    tool: McpToolName
  ): Array<{ skillPath: string; communicationPath?: string }> {
    switch (tool) {
      // Cursor, Copilot, and Antigravity all read .agents/skills/; Claude Code doesn't, hence its own case below.
      case "cursor":
      case "vscode":
      case "antigravity":
        return [
          {
            skillPath: path.join(
              workspaceFolderPath,
              ".agents",
              "skills",
              SKILL_DIR,
              SKILL_FILENAME
            ),
            communicationPath: path.join(
              workspaceFolderPath,
              ".agents",
              "skills",
              SKILL_DIR,
              COMMUNICATION_FILENAME
            )
          }
        ];
      case "claudeCode":
        return [
          {
            skillPath: path.join(
              workspaceFolderPath,
              ".claude",
              "skills",
              SKILL_DIR,
              SKILL_FILENAME
            ),
            communicationPath: path.join(
              workspaceFolderPath,
              ".claude",
              "skills",
              SKILL_DIR,
              COMMUNICATION_FILENAME
            )
          }
        ];
      default:
        return [];
    }
  }
}
