import { getExtensionVersion } from "../../lib/webviewAssets";
import { useHealthStore } from "../../stores/healthStore";

function statusDotClass(state: "up" | "down" | "unknown"): string {
  if (state === "up") return "vindicate-status-dot vindicate-status-dot--green";
  if (state === "down") return "vindicate-status-dot vindicate-status-dot--red";
  return "vindicate-status-dot vindicate-status-dot--gray";
}

function StatusItem({ label, state }: { label: string; state: "up" | "down" | "unknown" }) {
  return (
    <div className="vindicate-footer-status">
      <span className={statusDotClass(state)} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function PanelFooter() {
  const runtime = useHealthStore((s) => s.runtime);
  const mcp = useHealthStore((s) => s.mcp);
  const version = getExtensionVersion();

  return (
    <footer className="vindicate-panel-footer">
      <StatusItem label="Vindicate Runtime" state={runtime} />
      <StatusItem label="Vindicate MCP" state={mcp} />
      <div className="flex-1" />
      <span className="vindicate-footer-version">v{version}</span>
    </footer>
  );
}
