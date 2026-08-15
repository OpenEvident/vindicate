/**
 * @file SSE command-stream → MCP progress notifications bridge.
 */
import { logger } from "../core/logger.js";

export interface ProgressNotification {
  readonly progressToken: string | number;
  readonly progress?: number;
  readonly total?: number;
  readonly message?: string;
}

export type ProgressNotifier = (params: ProgressNotification) => Promise<void>;

export interface ProgressBridgeOpts<T> {
  readonly sessionId: string;
  readonly progressToken?: string | number;
  readonly totalSteps?: number;
  readonly run: (emit: (event: Record<string, unknown>) => void) => Promise<T>;
}

export class ProgressBridge {
  private streamOpenedBeforeRun = false;
  private notifyFailureLogged = false;

  constructor(private readonly notify: ProgressNotifier) {}

  get subscriptionOpenedBeforeRun(): boolean {
    return this.streamOpenedBeforeRun;
  }

  async runWithProgress<T>(opts: ProgressBridgeOpts<T>): Promise<T> {
    if (opts.progressToken === undefined) {
      return opts.run(() => undefined);
    }

    this.streamOpenedBeforeRun = false;
    this.notifyFailureLogged = false;
    let stepIndex = 0;

    const emit = (event: Record<string, unknown>): void => {
      if (event.event === "step_started" || event.event === "step_completed") {
        stepIndex = typeof event.step === "number" ? event.step : stepIndex;
      }
      // Fire-and-forget must never leave an unhandled rejection: the notifier
      // rejects when the client disconnects mid-command (closed transport), and
      // an unhandled rejection kills the whole MCP process. Log once — every
      // subsequent step event would fail the same way.
      this.mapEvent(event, opts.progressToken!, opts.totalSteps, stepIndex).catch(
        (err: unknown) => {
          if (!this.notifyFailureLogged) {
            this.notifyFailureLogged = true;
            logger.warn(
              { err },
              "progress notification failed (client likely disconnected) — further failures for this call won't be logged"
            );
          }
        }
      );
    };

    try {
      return await opts.run((event) => {
        if (!this.streamOpenedBeforeRun) {
          this.streamOpenedBeforeRun = true;
        }
        emit(event);
      });
    } finally {
      /* stream closed when run completes */
    }
  }

  private async mapEvent(
    event: Record<string, unknown>,
    progressToken: string | number,
    totalSteps: number | undefined,
    currentStep: number
  ): Promise<void> {
    const ev = event.event;
    const total = totalSteps !== undefined ? { total: totalSteps } : {};
    if (ev === "step_started") {
      const step = typeof event.step === "number" ? event.step : currentStep;
      const action = typeof event.action === "string" ? event.action : "step";
      await this.notify({ progressToken, progress: step, ...total, message: action });
    } else if (ev === "step_completed") {
      const step = typeof event.step === "number" ? event.step : currentStep;
      const action = typeof event.action === "string" ? event.action : "step";
      const duration = typeof event.duration_ms === "number" ? event.duration_ms : 0;
      await this.notify({
        progressToken,
        progress: step + 1,
        ...total,
        message: `✓ ${action} (${duration}ms)`
      });
    } else if (ev === "step_progress") {
      const message = typeof event.message === "string" ? event.message : "";
      await this.notify({ progressToken, progress: currentStep, ...total, message });
    } else if (ev === "action_result") {
      await this.notify({
        progressToken,
        progress: currentStep,
        ...total,
        message: "✓ Action complete"
      });
    } else if (ev === "test_started") {
      const title = typeof event.title === "string" ? event.title : "test";
      await this.notify({
        progressToken,
        progress: currentStep,
        ...total,
        message: `Running: ${title}`
      });
    } else if (ev === "test_passed") {
      const title = typeof event.title === "string" ? event.title : "test";
      await this.notify({ progressToken, progress: currentStep, ...total, message: `✓ ${title}` });
    } else if (ev === "test_failed") {
      const title = typeof event.title === "string" ? event.title : "test";
      await this.notify({ progressToken, progress: currentStep, ...total, message: `✗ ${title}` });
    }
  }
}
