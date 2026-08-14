import * as vscode from "vscode";
import { WORKSPACE_STATE_KEYS } from "./constants";
import type { Mode, VindicateWorkspaceState, PromptTemplate, StepId } from "./types";

export interface IWorkspaceStateService {
  getState(): VindicateWorkspaceState;
  getPromptTemplates(): PromptTemplate[];
  setPromptTemplates(templates: PromptTemplate[]): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  setToolsConfirmed(): Promise<void>;
  markStepDone(step: StepId): Promise<void>;
  unmarkStep(step: StepId): Promise<void>;
  setOnboardingDone(): Promise<void>;
  clearOnboardingDone(): Promise<void>;
  reset(): Promise<void>;
}

export class WorkspaceStateService implements IWorkspaceStateService {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  getState(): VindicateWorkspaceState {
    return {
      selectedMode: this.ctx.workspaceState.get<Mode | null>(
        WORKSPACE_STATE_KEYS.selectedMode,
        null
      ),
      completedSteps: this.ctx.workspaceState.get<StepId[]>(
        WORKSPACE_STATE_KEYS.completedSteps,
        []
      ),
      onboardingDone: this.ctx.workspaceState.get<boolean>(
        WORKSPACE_STATE_KEYS.onboardingDone,
        false
      ),
      toolsConfirmed: this.ctx.workspaceState.get<boolean>(
        WORKSPACE_STATE_KEYS.toolsConfirmed,
        false
      )
    };
  }

  getPromptTemplates(): PromptTemplate[] {
    return this.ctx.workspaceState.get<PromptTemplate[]>(WORKSPACE_STATE_KEYS.promptTemplates, []);
  }

  async setPromptTemplates(templates: PromptTemplate[]): Promise<void> {
    await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.promptTemplates, templates);
  }

  async setMode(mode: Mode): Promise<void> {
    await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.selectedMode, mode);
  }

  async setToolsConfirmed(): Promise<void> {
    await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.toolsConfirmed, true);
  }

  async markStepDone(step: StepId): Promise<void> {
    const current = this.ctx.workspaceState.get<StepId[]>(WORKSPACE_STATE_KEYS.completedSteps, []);
    if (!current.includes(step)) {
      await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.completedSteps, [...current, step]);
    }
  }

  async unmarkStep(step: StepId): Promise<void> {
    const current = this.ctx.workspaceState.get<StepId[]>(WORKSPACE_STATE_KEYS.completedSteps, []);
    if (current.includes(step)) {
      await this.ctx.workspaceState.update(
        WORKSPACE_STATE_KEYS.completedSteps,
        current.filter((s) => s !== step)
      );
    }
  }

  async setOnboardingDone(): Promise<void> {
    await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.onboardingDone, true);
  }

  async clearOnboardingDone(): Promise<void> {
    await this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.onboardingDone, false);
  }

  async reset(): Promise<void> {
    await Promise.all([
      this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.selectedMode, null),
      this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.completedSteps, []),
      this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.onboardingDone, false),
      this.ctx.workspaceState.update(WORKSPACE_STATE_KEYS.toolsConfirmed, false)
    ]);
  }
}
