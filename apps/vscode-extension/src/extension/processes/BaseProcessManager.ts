import { access } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import * as vscode from "vscode";
import { VindicateError } from "../shared/errors";
import { RUNTIME_ERROR_CODES } from "../shared/runtimeErrors";
import type { ILogger } from "../shared/logger";
import type { ProcessState } from "./types";

const SIGTERM_TIMEOUT_MS = 3_000;

export abstract class BaseProcessManager implements vscode.Disposable {
  private process: ChildProcessWithoutNullStreams | undefined;
  private state: ProcessState = "stopped";
  private readonly didStateChangeEmitter = new vscode.EventEmitter<ProcessState>();

  readonly onDidStateChange = this.didStateChangeEmitter.event;

  protected constructor(
    protected readonly logger: ILogger,
    protected readonly extensionPath: string
  ) {}

  get currentState(): ProcessState {
    return this.state;
  }

  get hasSpawnedProcess(): boolean {
    return this.process !== undefined;
  }

  async start(extraEnv?: Record<string, string>): Promise<void> {
    if (this.process) {
      this.logger.info(`[${this.getName()}] Start requested but process is already running.`);
      return;
    }

    this.logger.info(`[${this.getName()}] Starting process.`);
    this.setState("starting");
    const entryPath = await this.ensureEntry();
    if (!entryPath) {
      this.setState("error");
      throw new VindicateError(
        `[${this.getName()}] Runtime not built. Run: ${this.getBuildCommand()}`,
        RUNTIME_ERROR_CODES.runtimeEntryMissing
      );
    }

    this.process = spawn(process.execPath, [entryPath], {
      cwd: path.dirname(entryPath),
      env: { ...process.env, ...extraEnv },
      stdio: "pipe"
    });

    this.process.stdout.on("data", (chunk: Buffer) => {
      for (const line of splitLines(chunk)) {
        this.logChildLine(line);
      }
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      for (const line of splitLines(chunk)) {
        this.logChildLine(line);
      }
    });
    this.process.on("spawn", () => this.setState("running"));
    this.process.on("error", (error) => {
      this.logger.error(`[${this.getName()}] ${String(error)}`);
      this.setState("error");
    });
    this.process.on("exit", (code) => {
      this.process = undefined;
      this.setState(code === 0 || code === null ? "stopped" : "error");
    });
  }

  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc) {
      this.setState("stopped");
      return;
    }

    this.logger.info(`[${this.getName()}] Stopping process (graceful).`);
    this.process = undefined;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.logger.warn(`[${this.getName()}] SIGTERM timeout — sending SIGKILL.`);
        try {
          proc.kill("SIGKILL");
        } catch {
          /* already dead */
        }
        resolve();
      }, SIGTERM_TIMEOUT_MS);

      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });

    this.setState("stopped");
    this.logger.info(`[${this.getName()}] Process stopped.`);
  }

  waitForRunning(): Promise<void> {
    if (this.state === "running") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const disposable = this.onDidStateChange((next) => {
        if (next === "running") {
          disposable.dispose();
          resolve();
        } else if (next === "error" || next === "stopped") {
          disposable.dispose();
          reject(new Error(`[${this.getName()}] Process failed to reach running state (${next})`));
        }
      });
    });
  }

  dispose(): void {
    void this.stop();
    this.didStateChangeEmitter.dispose();
  }

  protected abstract getName(): string;
  protected abstract getBuildCommand(): string;
  protected abstract getEntryRelativePath(): string;

  protected setState(nextState: ProcessState): void {
    this.state = nextState;
    this.didStateChangeEmitter.fire(nextState);
  }

  private logChildLine(line: string): void {
    const name = this.getName();
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const level = (parsed["level"] as string | undefined) ?? "info";
      const msg = (parsed["msg"] as string | undefined) ?? line;
      const err = parsed["err"] as { message?: string; stack?: string } | undefined;

      const skip = new Set(["level", "time", "service", "pid", "hostname", "msg", "err"]);
      const extras = Object.entries(parsed)
        .filter(([k]) => !skip.has(k))
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join(" ");

      let full = `[${name}] ${msg}`;
      if (extras) full += ` | ${extras}`;
      if (err?.message) full += ` — ${err.message}`;

      if (level === "error" || level === "fatal") {
        this.logger.error(full);
        if (err?.stack) {
          this.logger.error(`[${name}] ${err.stack}`);
        }
      } else if (level === "warn" || level === "warning") {
        this.logger.warn(full);
      } else {
        this.logger.info(full);
      }
    } catch {
      this.logger.info(`[${name}] ${line}`);
    }
  }

  private async ensureEntry(): Promise<string | undefined> {
    const entryPath = path.resolve(this.extensionPath, this.getEntryRelativePath());
    try {
      await access(entryPath);
      return entryPath;
    } catch {
      this.logger.warn(
        `[${this.getName()}] Missing entrypoint. Build command: ${this.getBuildCommand()}`
      );
      return undefined;
    }
  }
}

function splitLines(chunk: Buffer): string[] {
  return chunk
    .toString()
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}
