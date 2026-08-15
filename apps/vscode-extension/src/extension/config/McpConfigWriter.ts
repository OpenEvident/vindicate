import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import type { McpTarget } from "./MCP_TARGETS";

export interface IMcpConfigWriter {
  write(target: McpTarget): Promise<McpWriteResult>;
  remove(target: McpTarget): Promise<McpWriteResult>;
  isConfigured(target: McpTarget): Promise<boolean>;
}

export type McpWriteResult = { ok: true; alreadyPresent: boolean } | { ok: false; error: string };

export class McpConfigWriter implements IMcpConfigWriter {
  constructor(private readonly logger: ILogger) {}

  async isConfigured(target: McpTarget): Promise<boolean> {
    try {
      const raw = await readFile(target.configPath, "utf8");
      const json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const bucket = json[target.format] ?? {};
      return Boolean(bucket[target.serverKey]);
    } catch {
      return false;
    }
  }

  async write(target: McpTarget): Promise<McpWriteResult> {
    try {
      let json: Record<string, Record<string, unknown>> = {};
      try {
        const raw = await readFile(target.configPath, "utf8");
        try {
          json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
        } catch {
          // Empty or malformed file — treat as a fresh config and overwrite.
          this.logger.warn(
            `Malformed MCP config at ${target.configPath} — resetting to empty config.`
          );
        }
      } catch (err) {
        if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
          return { ok: false, error: String(err) };
        }
      }

      const bucket = json[target.format] ?? {};
      if (bucket[target.serverKey]) {
        return { ok: true, alreadyPresent: true };
      }

      json[target.format] = { ...bucket, [target.serverKey]: target.serverValue };
      await mkdir(path.dirname(target.configPath), { recursive: true });
      await writeFile(target.configPath, JSON.stringify(json, null, 2), "utf8");
      return { ok: true, alreadyPresent: false };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async remove(target: McpTarget): Promise<McpWriteResult> {
    try {
      let json: Record<string, Record<string, unknown>> = {};
      try {
        const raw = await readFile(target.configPath, "utf8");
        try {
          json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
        } catch {
          this.logger.warn(`Malformed MCP config at ${target.configPath}`);
          return { ok: false, error: "Malformed JSON" };
        }
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
          return { ok: true, alreadyPresent: false };
        }
        return { ok: false, error: String(err) };
      }

      const bucket = json[target.format] ?? {};
      if (!bucket[target.serverKey]) {
        return { ok: true, alreadyPresent: false };
      }

      const nextBucket = { ...bucket };
      delete nextBucket[target.serverKey];
      json[target.format] = nextBucket;
      await mkdir(path.dirname(target.configPath), { recursive: true });
      await writeFile(target.configPath, JSON.stringify(json, null, 2), "utf8");
      return { ok: true, alreadyPresent: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
