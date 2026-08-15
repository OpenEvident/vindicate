import { useState } from "react";
import { BUILT_IN_PROMPTS } from "../../lib/prompts";
import { getLogoTextUri } from "../../lib/webviewAssets";
import { useHealthStore } from "../../stores/healthStore";
import { usePromptsStore } from "../../stores/promptsStore";
import { ConfigTab } from "./ConfigTab";
import { PromptsTab } from "./PromptsTab";

type Tab = "prompts" | "config";

const TABS: Tab[] = ["prompts", "config"];

const TAB_LABELS: Record<Tab, string> = {
  prompts: "Prompts",
  config: "Config"
};

function statusDotClass(state: "up" | "down" | "unknown"): string {
  if (state === "up") return "vindicate-status-dot vindicate-status-dot--green";
  if (state === "down") return "vindicate-status-dot vindicate-status-dot--red";
  return "vindicate-status-dot vindicate-status-dot--gray";
}

function UtilityStatus({ label, state }: { label: string; state: "up" | "down" | "unknown" }) {
  return (
    <span className="vindicate-utility-status-item">
      <span className={statusDotClass(state)} aria-hidden />
      {label}
    </span>
  );
}

export function PanelView() {
  const [tab, setTab] = useState<Tab>("prompts");
  const runtime = useHealthStore((s) => s.runtime);
  const mcp = useHealthStore((s) => s.mcp);
  const customTemplates = usePromptsStore((s) => s.templates);
  const logoTextUri = getLogoTextUri();
  const promptCount = BUILT_IN_PROMPTS.length + customTemplates.length;

  return (
    <div className="vindicate-utility-panel">
      <header className="vindicate-utility-header">
        <div className="vindicate-utility-header-left">
          {logoTextUri ? (
            <img src={logoTextUri} alt="Vindicate" className="vindicate-utility-logo" />
          ) : (
            <span className="vindicate-utility-title">Vindicate</span>
          )}
        </div>
        <div className="vindicate-utility-status">
          <UtilityStatus label="Runtime" state={runtime} />
          <UtilityStatus label="MCP" state={mcp} />
        </div>
      </header>

      <nav
        className="dash-tabs vindicate-utility-tabs-v2"
        role="tablist"
        aria-label="Vindicate panel"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`dash-tab${tab === t ? " on" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
            {t === "prompts" && <span className="count">{promptCount}</span>}
          </button>
        ))}
      </nav>

      <main className="vindicate-utility-content" role="tabpanel">
        {tab === "prompts" && (
          <>
            <PromptsTab />
          </>
        )}
        {tab === "config" && (
          <>
            <p className="vindicate-utility-section-title">MCP and agent setup</p>
            <ConfigTab />
          </>
        )}
      </main>
    </div>
  );
}
