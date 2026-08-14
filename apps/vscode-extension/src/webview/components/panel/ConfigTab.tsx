import { postToExtension } from "../../lib/bridge";
import { RefreshCw } from "lucide-react";
import type { ToolBrandId } from "../../lib/brandAssets";
import type { McpToolName } from "../../lib/types";
import { useConfigStore } from "../../stores/configStore";
import { useHealthStore } from "../../stores/healthStore";
import { ToolBrandIcon } from "../shared/ToolBrandIcon";

const ITEMS: Array<{
  key: McpToolName;
  label: string;
  brand?: ToolBrandId;
}> = [
  { key: "cursor", label: "Cursor MCP", brand: "cursor" },
  { key: "vscode", label: "GitHub Copilot MCP", brand: "copilot" },
  { key: "claudeCode", label: "Claude Code MCP", brand: "claude" },
  { key: "antigravity", label: "Antigravity MCP", brand: "antigravity" }
];

export function ConfigTab() {
  const statuses = useConfigStore((s) => s.statuses);
  const pending = useConfigStore((s) => s.pending);
  const setPending = useConfigStore((s) => s.setPending);
  const runtime = useHealthStore((s) => s.runtime);
  const mcp = useHealthStore((s) => s.mcp);

  const handleAdd = (key: McpToolName) => {
    setPending(key, true);
    postToExtension({ type: "config:addMcp", tool: key });
  };

  const handleResync = (key: McpToolName) => {
    setPending(key, true);
    postToExtension({ type: "config:resyncMcp", tool: key });
  };

  const handleDisconnect = (key: McpToolName) => {
    setPending(key, true);
    postToExtension({ type: "config:disconnectMcp", tool: key });
  };

  const agentItems = ITEMS;
  const mcpPairedCount = [statuses.cursor, statuses.vscode, statuses.claudeCode, statuses.antigravity].filter(
    Boolean
  ).length;
  const connectedClients = [statuses.cursor, statuses.vscode, statuses.claudeCode, statuses.antigravity]
    .map((value, idx) => (value ? idx : -1))
    .filter((value) => value >= 0).length;

  const runtimeBadge = runtime === "up" ? "Healthy" : runtime === "down" ? "Offline" : "Unknown";
  const mcpBadge =
    mcp === "down" ? "Offline" : mcp === "up" ? `${mcpPairedCount} of 4 paired` : "Unknown";

  const connTone = (
    state: "up" | "down" | "unknown",
    opts?: {
      partialPaired?: boolean;
    }
  ): "green" | "amber" | "red" => {
    if (state === "down") return "red";
    if (state === "unknown") return "amber";
    if (opts?.partialPaired) return "amber";
    return "green";
  };

  return (
    <div className="vindicate-config-v2">
      <section className="vindicate-config-v2-connections-block">
        <div className="opp-group">
          <div>
            <h3>Connections</h3>
            <div className="hint">Status of the two pieces that make Vindicate work.</div>
          </div>
          <button className="opp-mini-btn ghost" type="button" onClick={() => postToExtension({ type: "ready" })}>
            <RefreshCw size={13} strokeWidth={2} />
            Re-check
          </button>
        </div>

        <div className="opp-conn-grid">
          <div className={`opp-conn ${connTone(runtime)}`}>
            <div className="opp-conn-head">
              <span className="name">
                <span className="dot" />
                Runtime
              </span>
              <span className="state">{runtimeBadge}</span>
            </div>
            <div className="opp-conn-body">
              Local Vindicate daemon orchestrating scaffolding and file-watching.
              <div>
                {runtime === "up"
                  ? "Daemon reachable."
                  : runtime === "down"
                    ? "Daemon is not reachable."
                    : "Health has not been detected yet."}
              </div>
            </div>
          </div>

          <div className={`opp-conn ${connTone(mcp, { partialPaired: mcp === "up" && mcpPairedCount < 4 })}`}>
            <div className="opp-conn-head">
              <span className="name">
                <span className="dot" />
                MCP server
              </span>
              <span className="state">{mcpBadge}</span>
            </div>
            <div className="opp-conn-body">
              Bridges your prompts and context to AI agents over the Model Context Protocol.
              <div>
                {mcp === "up"
                  ? `${connectedClients} client${connectedClients === 1 ? "" : "s"} connected.`
                  : mcp === "down"
                    ? "MCP server is not reachable."
                    : "Health has not been detected yet."}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="vindicate-config-v2-agents-block">
        <div className="opp-group">
          <div>
            <h3>AI coding agents</h3>
            <div className="hint">Pair an agent to use Vindicate capabilities.</div>
          </div>
        </div>

        {agentItems.map(({ key, label, brand }) => {
          const connected = statuses[key];
          return (
            <article key={key} className="opp-agent">
              <div className="gloss">{brand ? <ToolBrandIcon brand={brand} label={label} /> : null}</div>
              <div className="meta">
                <div className="title">
                  {label}
                  <span className={`opp-state-pill ${connected ? "connected" : "available"}`}>
                    {connected ? "Connected" : "Available"}
                  </span>
                </div>
                <div className="sub">
                  {connected
                    ? "Detected in workspace configuration."
                    : "Not configured in this workspace yet."}
                </div>
              </div>
              <div className="actions">
                {pending[key] ? (
                  <span className="vindicate-config-pending" aria-busy="true">
                    Working...
                  </span>
                ) : connected ? (
                  <>
                    <button className="opp-mini-btn ghost" type="button" onClick={() => handleResync(key)}>
                      Re-sync
                    </button>
                    <button className="opp-mini-btn ghost" type="button" onClick={() => handleDisconnect(key)}>
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button className="opp-mini-btn" type="button" onClick={() => handleAdd(key)}>
                    Add
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
