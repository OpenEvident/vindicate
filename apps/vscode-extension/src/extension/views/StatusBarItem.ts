import * as vscode from "vscode";
import { COMMANDS } from "../shared/constants";
import type { ServiceHealth } from "../../shared/types";

export type StatusBarState = "noFolder" | "setup" | "active" | "error";

export class VindicateStatusBarItem implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private state: StatusBarState = "noFolder";
  private serviceHealth: ServiceHealth | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = COMMANDS.statusBarMenu;
    this.item.tooltip = "Vindicate — click for shortcuts";
    this.setState("noFolder");
    this.item.show();
  }

  setState(state: StatusBarState): void {
    this.state = state;
    this.render();
  }

  setServiceHealth(health: ServiceHealth): void {
    this.serviceHealth = health;
    this.render();
  }

  private render(): void {
    const labels: Record<StatusBarState, string> = {
      noFolder: "$(folder) Vindicate",
      setup: "$(gear~spin) Vindicate: Setup",
      active: "$(check) Vindicate: Active",
      error: "$(warning) Vindicate"
    };
    let text = labels[this.state];
    if (this.state !== "noFolder" && this.serviceHealth) {
      text = `${text} · ${healthSummary(this.serviceHealth)}`;
    }
    this.item.text = text;
    this.item.backgroundColor =
      this.state === "error" ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    this.item.tooltip = "Vindicate — click for shortcuts";
  }

  dispose(): void {
    this.item.dispose();
  }
}

function healthSummary(health: ServiceHealth): string {
  const dot = (s: ServiceHealth["runtime"]) => (s === "up" ? "●" : s === "down" ? "○" : "◌");
  return `RT ${dot(health.runtime)}  MCP ${dot(health.mcp)}`;
}
