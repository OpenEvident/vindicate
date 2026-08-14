import * as vscode from "vscode";
import type { ILogger } from "../shared/logger";

export type TelemetryEvent =
  | "sign_in_complete"
  | "sign_out"
  | "mode_selected"
  | "step_completed"
  | "step_revoked"
  | "onboarding_finished"
  | "config_written"
  | "metrics_refreshed"
  | "tool_selected";

export interface ITelemetryService {
  track(event: TelemetryEvent, properties?: Record<string, string>): void;
}

export class TelemetryService implements ITelemetryService {
  constructor(private readonly logger: ILogger) {}

  track(event: TelemetryEvent, properties?: Record<string, string>): void {
    if (!vscode.env.isTelemetryEnabled) return;
    this.send(event, properties).catch((err) => {
      this.logger.debug(`Telemetry failed silently: ${String(err)}`);
    });
  }

  private async send(event: TelemetryEvent, properties?: Record<string, string>): Promise<void> {
    this.logger.debug(`[telemetry] ${event} ${JSON.stringify(properties ?? {})}`);
  }
}
