import { buildMcpTargets } from "./MCP_TARGETS";
import type { IAgentSkillWriter } from "./AgentSkillWriter";
import type { IAntigravityAgentsMdWriter } from "./AntigravityAgentsMdWriter";
import type { IClaudeMdWriter } from "./ClaudeMdWriter";
import type { ICopilotInstructionsWriter } from "./CopilotInstructionsWriter";
import type { ICursorRuleWriter } from "./CursorRuleWriter";
import type { IMcpConfigWriter } from "./McpConfigWriter";
import type { IToolDetector } from "./ToolDetector";
import type { ConfigStatuses, SelectedTools } from "../shared/types";

export interface IConfigStatusService {
  getStatuses(folderPath: string | null): Promise<ConfigStatuses>;
  getDefaultToolSelection(): Promise<SelectedTools>;
}

export class ConfigStatusService implements IConfigStatusService {
  constructor(
    private readonly toolDetector: IToolDetector,
    private readonly mcpWriter: IMcpConfigWriter,
    private readonly ruleWriter: ICursorRuleWriter,
    private readonly claudeMdWriter: IClaudeMdWriter,
    private readonly copilotWriter: ICopilotInstructionsWriter,
    private readonly skillWriter: IAgentSkillWriter,
    private readonly antigravityAgentsMdWriter: IAntigravityAgentsMdWriter
  ) {}

  async getStatuses(folderPath: string | null): Promise<ConfigStatuses> {
    const targets = buildMcpTargets(folderPath);
    const detected = await this.toolDetector.detect();
    const cursorTarget = targets.find((t) => t.name === "Cursor");
    const vscodeTarget = targets.find((t) => t.name === "VS Code");
    const claudeCodeTarget = targets.find((t) => t.name === "Claude Code");
    const antigravityTarget = targets.find((t) => t.name === "Antigravity");

    return {
      cursor:
        detected.cursor && cursorTarget ? await this.mcpWriter.isConfigured(cursorTarget) : false,
      vscode:
        detected.vscodeNative && vscodeTarget
          ? await this.mcpWriter.isConfigured(vscodeTarget)
          : false,
      claudeCode: claudeCodeTarget ? await this.mcpWriter.isConfigured(claudeCodeTarget) : false,
      antigravity:
        detected.antigravity && antigravityTarget
          ? await this.mcpWriter.isConfigured(antigravityTarget)
          : false,
      cursorRule: folderPath ? await this.ruleWriter.isConfigured(folderPath) : false,
      agentMd: folderPath ? await this.claudeMdWriter.isConfigured(folderPath) : false,
      copilotInstructions: folderPath ? await this.copilotWriter.isConfigured(folderPath) : false,
      antigravityRule: folderPath
        ? await this.antigravityAgentsMdWriter.isConfigured(folderPath)
        : false,
      agentSkill: folderPath ? await this.isAnySkillConfigured(folderPath) : false
    };
  }

  private async isAnySkillConfigured(folderPath: string): Promise<boolean> {
    for (const tool of ["cursor", "claudeCode", "vscode", "antigravity"] as const) {
      if (await this.skillWriter.isConfigured(folderPath, tool)) {
        return true;
      }
    }
    return false;
  }

  async getDefaultToolSelection(): Promise<SelectedTools> {
    const detected = await this.toolDetector.detect();
    return {
      cursor: detected.cursor,
      vscode: detected.vscodeNative,
      claudeCode: detected.claudeCode,
      antigravity: detected.antigravity
    };
  }
}
