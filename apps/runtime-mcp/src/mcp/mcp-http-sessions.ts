/**
 * @file Per-session Streamable HTTP transport routing for MCP clients.
 *
 * The MCP SDK requires one transport (and typically one McpServer) per client
 * session. A single shared transport rejects reconnects with "Server already
 * initialized". See: typescript-sdk/examples/server/src/simpleStreamableHttp.ts
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { logger } from "../core/logger.js";
import { createVindicateMcpServer, type McpServerFactoryDeps } from "./mcp-server.js";
import type { ProgressBridge } from "./progress.js";

interface McpSessionEntry {
  readonly transport: StreamableHTTPServerTransport;
  readonly server: McpServer;
  readonly progressBridge: ProgressBridge;
}

function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string
): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null
    })
  );
}

function getSessionIdHeader(req: IncomingMessage): string | undefined {
  const raw = req.headers["mcp-session-id"];
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].length > 0) {
    return raw[0];
  }
  return undefined;
}

/**
 * Per-session project root supplied by the client (the IDE extension writes it
 * into the workspace's `.mcp.json`). This is what lets one server on a fixed
 * port serve multiple windows/workspaces correctly: identity travels with the
 * session, not the process.
 *
 * Read from the `project_root` URL query parameter first, then the
 * `x-vindicate-project-root` header. The query parameter is primary because every
 * MCP client connects to the configured `url` verbatim, whereas custom headers
 * are not reliably forwarded by all clients (e.g. Claude Code issue #14977).
 * Returns a validated absolute path, or `undefined` to fall back to the
 * boot-time `VINDICATE_PROJECT_ROOT` (e.g. Claude Desktop, which has no workspace).
 */
function getRequestProjectRoot(req: IncomingMessage): string | undefined {
  let fromQuery: string | null = null;
  if (typeof req.url === "string") {
    try {
      fromQuery = new URL(req.url, "http://localhost").searchParams.get("project_root");
    } catch {
      fromQuery = null;
    }
  }
  const rawHeader = req.headers["x-vindicate-project-root"];
  const fromHeader =
    typeof rawHeader === "string" ? rawHeader : Array.isArray(rawHeader) ? rawHeader[0] : undefined;
  const candidate = (fromQuery ?? fromHeader)?.trim();
  if (candidate === undefined || candidate.length === 0) {
    return undefined;
  }
  // Reject relative paths — silently resolving them against the server's CWD is
  // exactly the cross-window mismatch this mechanism exists to prevent.
  if (!path.isAbsolute(candidate)) {
    logger.warn({ candidate }, "[MCP HTTP] Ignoring non-absolute project root");
    return undefined;
  }
  return candidate;
}

export function createMcpHttpSessionManager(deps: McpServerFactoryDeps): {
  handleRequest: (req: IncomingMessage, res: ServerResponse, body?: unknown) => Promise<void>;
  closeAll: () => Promise<void>;
} {
  const sessions = new Map<string, McpSessionEntry>();

  async function closeSession(sessionId: string): Promise<void> {
    const entry = sessions.get(sessionId);
    if (entry === undefined) {
      return;
    }
    sessions.delete(sessionId);
    try {
      await entry.server.close();
      await entry.transport.close();
    } catch (err: unknown) {
      logger.warn({ err, sessionId }, "[MCP HTTP] Error closing session");
    }
  }

  async function createSession(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    const projectRoot = getRequestProjectRoot(req) ?? deps.config.VINDICATE_PROJECT_ROOT;
    const pending: { entry?: McpSessionEntry } = {};

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        if (pending.entry !== undefined) {
          sessions.set(sessionId, pending.entry);
          logger.info({ sessionId, projectRoot }, "[MCP HTTP] Session initialized");
        }
      },
      onsessionclosed: (sessionId) => {
        void closeSession(sessionId);
      }
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId !== undefined) {
        void closeSession(sessionId);
      }
    };

    const created = createVindicateMcpServer({
      ...deps,
      projectRoot,
      progressNotifier: async (params) => {
        const entry = pending.entry;
        if (entry === undefined) {
          return;
        }
        await entry.server.server.notification({
          method: "notifications/progress",
          params: { ...params }
        });
      }
    });

    pending.entry = {
      transport,
      server: created.server,
      progressBridge: created.progressBridge
    };

    await created.server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, body);
  }

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown
  ): Promise<void> {
    const sessionId = getSessionIdHeader(req);

    try {
      if (sessionId !== undefined) {
        const entry = sessions.get(sessionId);
        if (entry === undefined) {
          writeJsonRpcError(res, 404, -32_001, "Session not found");
          return;
        }
        await entry.transport.handleRequest(req, res, body);
        return;
      }

      if (isInitializeRequest(body)) {
        await createSession(req, res, body);
        return;
      }

      writeJsonRpcError(res, 400, -32_000, "Bad Request: Session ID required");
    } catch (err: unknown) {
      logger.error({ err, sessionId }, "[MCP HTTP] Request failed");
      if (!res.headersSent && !res.writableEnded) {
        writeJsonRpcError(res, 500, -32_603, "Internal server error");
      }
    }
  }

  async function closeAll(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map((id) => closeSession(id)));
  }

  return { handleRequest, closeAll };
}
