import { appendFileSync } from "node:fs";
import * as vscode from "vscode";

export interface ILogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  debug(message: string): void;
  show(): void;
}

export class VindicateLogger implements ILogger, vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;
  private readonly logFile: string | undefined;

  constructor(logFile?: string) {
    this.channel = vscode.window.createOutputChannel("Vindicate", { log: true });
    this.logFile = logFile;
  }

  info(message: string): void {
    this.channel.info(message);
    this.appendToFile("info", message);
  }

  warn(message: string): void {
    this.channel.warn(message);
    this.appendToFile("warn", message);
  }

  debug(message: string): void {
    this.channel.debug(message);
    this.appendToFile("debug", message);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? error.message : String(error ?? "");
    this.channel.error(detail ? `${message}: ${detail}` : message);
    this.appendToFile("error", message, error);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }

  private appendToFile(level: string, msg: string, error?: unknown): void {
    if (!this.logFile) return;
    try {
      const entry: Record<string, unknown> = {
        time: new Date().toISOString(),
        level,
        service: "extension",
        msg
      };
      if (error instanceof Error) {
        entry["err"] = { message: error.message, stack: error.stack };
      } else if (error != null && error !== "") {
        entry["err"] = { message: String(error) };
      }
      appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
    } catch (err) {
      this.channel.error(`[debug] log file write failed: ${String(err)}`);
    }
  }
}
