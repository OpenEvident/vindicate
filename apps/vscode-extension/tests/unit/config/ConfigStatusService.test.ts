import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigStatusService } from "../../../src/extension/config/ConfigStatusService";

describe("ConfigStatusService", () => {
  const toolDetector = { detect: vi.fn() };
  const mcpWriter = { write: vi.fn(), remove: vi.fn(), isConfigured: vi.fn() };
  const ruleWriter = { isConfigured: vi.fn() };
  const agentMdWriter = { isConfigured: vi.fn() };
  const copilotWriter = { isConfigured: vi.fn() };
  const skillWriter = { isConfigured: vi.fn(), write: vi.fn() };
  const antigravityAgentsMdWriter = { isConfigured: vi.fn(), write: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    toolDetector.detect.mockResolvedValue({
      cursor: true,
      vscodeNative: false,
      claudeCode: true,
      antigravity: false
    });
    mcpWriter.isConfigured.mockResolvedValue(false);
    ruleWriter.isConfigured.mockResolvedValue(true);
    agentMdWriter.isConfigured.mockResolvedValue(false);
    copilotWriter.isConfigured.mockResolvedValue(false);
    skillWriter.isConfigured.mockResolvedValue(true);
    antigravityAgentsMdWriter.isConfigured.mockResolvedValue(false);
  });

  it("getStatuses reflects folder writers", async () => {
    const service = new ConfigStatusService(
      toolDetector,
      mcpWriter,
      ruleWriter,
      agentMdWriter,
      copilotWriter,
      skillWriter,
      antigravityAgentsMdWriter
    );
    const statuses = await service.getStatuses("/project");
    expect(statuses.cursorRule).toBe(true);
    expect(statuses.agentMd).toBe(false);
    expect(statuses.agentSkill).toBe(true);
    expect(statuses.antigravityRule).toBe(false);
  });

  it("getDefaultToolSelection maps detector fields", async () => {
    const service = new ConfigStatusService(
      toolDetector,
      mcpWriter,
      ruleWriter,
      agentMdWriter,
      copilotWriter,
      skillWriter,
      antigravityAgentsMdWriter
    );
    const tools = await service.getDefaultToolSelection();
    expect(tools).toEqual({
      cursor: true,
      vscode: false,
      claudeCode: true,
      antigravity: false
    });
  });

  it("getDefaultToolSelection reflects antigravity detection", async () => {
    toolDetector.detect.mockResolvedValue({
      cursor: false,
      vscodeNative: false,
      claudeCode: false,
      antigravity: true
    });
    const service = new ConfigStatusService(
      toolDetector,
      mcpWriter,
      ruleWriter,
      agentMdWriter,
      copilotWriter,
      skillWriter,
      antigravityAgentsMdWriter
    );
    const tools = await service.getDefaultToolSelection();
    expect(tools).toEqual({
      cursor: false,
      vscode: false,
      claudeCode: false,
      antigravity: true
    });
  });
});
