import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExtensionMessages } from "../../../src/webview/hooks/useExtensionMessages";
import { useOnboardingStore } from "../../../src/webview/stores/onboardingStore";
import { useDashboardStore } from "../../../src/webview/stores/dashboardStore";
import { useHealthStore } from "../../../src/webview/stores/healthStore";
import { useConfigStore } from "../../../src/webview/stores/configStore";
import { usePromptsStore } from "../../../src/webview/stores/promptsStore";
import { useUiStore } from "../../../src/webview/stores/uiStore";
import * as bridge from "../../../src/webview/lib/bridge";

function Probe() {
  useExtensionMessages();
  return null;
}

function dispatch(data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

beforeEach(() => {
  useOnboardingStore.setState({
    screen: "noFolder",
    mode: null,
    completedSteps: [],
    hasFolder: false,
    folderName: null,
    onboardingDone: false,
    detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: false }
  });
  useDashboardStore.setState({ metrics: null, error: null, isLoading: false });
  useHealthStore.setState({ runtime: "unknown", mcp: "unknown" });
  useConfigStore.setState({
    statuses: {
      cursor: false,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    }
  });
  usePromptsStore.setState({ templates: [] });
});

describe("useExtensionMessages", () => {
  it("sends ready on mount", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<Probe />);
    expect(post).toHaveBeenCalledWith({ type: "ready" });
    post.mockRestore();
  });

  it("syncs onboarding state on onboarding:stateSync", () => {
    render(<Probe />);
    dispatch({
      type: "onboarding:stateSync",
      state: {
        selectedMode: "build",
        completedSteps: [1],
        onboardingDone: false,
        toolsConfirmed: true
      }
    });
    expect(useOnboardingStore.getState().completedSteps).toEqual([1]);
    expect(useOnboardingStore.getState().mode).toBe("build");
  });

  it("marks step and shows toast on onboarding:stepDone", () => {
    render(<Probe />);
    dispatch({ type: "onboarding:stepDone", step: 1 });
    expect(useOnboardingStore.getState().completedSteps).toContain(1);
  });

  it("revokes step and shows warning toast on onboarding:stepRevoked", () => {
    useOnboardingStore.setState({
      completedSteps: [1, 2],
      onboardingDone: false
    });
    render(<Probe />);
    dispatch({ type: "onboarding:stepRevoked", step: 1 });
    expect(useOnboardingStore.getState().completedSteps).toEqual([2]);
    expect(useUiStore.getState().toastMessage).toContain("domain.md");
  });

  it("sets detected tools on onboarding:toolsDetected", () => {
    render(<Probe />);
    dispatch({
      type: "onboarding:toolsDetected",
      tools: { cursor: true, vscode: false, claudeCode: false }
    });
    expect(useOnboardingStore.getState().detectedTools.cursor).toBe(true);
  });

  it("updates folder on workspace:resolved", () => {
    render(<Probe />);
    dispatch({
      type: "workspace:resolved",
      hasFolder: true,
      folderName: "myproject",
      folderPath: "E:/work/myproject"
    });
    expect(useOnboardingStore.getState().hasFolder).toBe(true);
    expect(useOnboardingStore.getState().folderName).toBe("myproject");
    expect(useOnboardingStore.getState().folderPath).toBe("E:/work/myproject");
  });

  it("sets screen on navigate:screen", () => {
    render(<Probe />);
    dispatch({ type: "navigate:screen", screen: "gettingStarted" });
    expect(useOnboardingStore.getState().screen).toBe("gettingStarted");
  });

  it("sets loading on dashboard:loading", () => {
    render(<Probe />);
    dispatch({ type: "dashboard:loading" });
    expect(useDashboardStore.getState().isLoading).toBe(true);
  });

  it("sets metrics on dashboard:metrics", () => {
    render(<Probe />);
    const metrics = {
      specCompleteness: 80,
      testTraceability: 60,
      testHealth: null,
      testFreshnessDays: null,
      features: [],
      healthScore: 70,
      lastUpdated: new Date().toISOString(),
      availability: {
        spec: { ready: true, reason: "ok" },
        trace: { ready: true, reason: "ok" },
        testHealth: { ready: false, reason: "no tests" },
        freshness: { ready: false, reason: "no file" },
        health: { ready: false, reason: "blocked" }
      }
    };
    dispatch({ type: "dashboard:metrics", metrics });
    expect(useDashboardStore.getState().metrics).toEqual(metrics);
    expect(useDashboardStore.getState().isLoading).toBe(false);
  });

  it("sets dashboard error on dashboard:error", () => {
    render(<Probe />);
    dispatch({ type: "dashboard:error", message: "fs error" });
    expect(useDashboardStore.getState().error).toBe("fs error");
  });

  it("sets health status on health:status", () => {
    render(<Probe />);
    dispatch({ type: "health:status", runtime: "up", mcp: "down" });
    expect(useHealthStore.getState().runtime).toBe("up");
    expect(useHealthStore.getState().mcp).toBe("down");
  });

  it("sets config statuses on config:status", () => {
    render(<Probe />);
    const statuses = {
      cursor: true,
      vscode: false,
      claudeCode: false,
      cursorRule: true,
      agentMd: false,
      copilotInstructions: false,
      agentSkill: false
    };
    dispatch({ type: "config:status", statuses });
    expect(useConfigStore.getState().statuses).toEqual(statuses);
  });

  it("clears pending and shows toast on config:operationResult", () => {
    useConfigStore.getState().setPending("cursor", true);
    render(<Probe />);
    dispatch({
      type: "config:operationResult",
      tool: "cursor",
      operation: "add",
      ok: true,
      message: "Cursor MCP configured."
    });
    expect(useConfigStore.getState().pending.cursor).toBe(false);
    expect(useUiStore.getState().toastMessage).toBe("Cursor MCP configured.");
  });

  it("sets templates on prompts:templates", () => {
    render(<Probe />);
    dispatch({
      type: "prompts:templates",
      templates: [
        {
          id: "t1",
          name: "My prompt",
          description: "desc",
          category: "tests",
          text: "body",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
    expect(usePromptsStore.getState().templates).toHaveLength(1);
  });

  it("ignores malformed messages without crashing", () => {
    render(<Probe />);
    expect(() => dispatch(null)).not.toThrow();
    expect(() => dispatch({ noType: true })).not.toThrow();
    expect(() => dispatch("string message")).not.toThrow();
  });
});
