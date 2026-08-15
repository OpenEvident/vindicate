import { postToExtension } from "../../lib/bridge";
import { MetricTip } from "../shared/MetricTip";

export type DashboardTabId = "overview" | "features" | "specs";

interface CanvasHeaderProps {
  project: string;
  mode: string;
  branch: string;
  lastRunAt: string;
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  counts: {
    features: number;
    specs: number;
  };
  isSyncing: boolean;
}

const TAB_META: Record<DashboardTabId, { label: string; subtitle: string }> = {
  overview: {
    label: "Project overview",
    subtitle: "health, traceability, and what needs attention."
  },
  features: { label: "Features", subtitle: "one row per feature spec, with linked tests." },
  specs: { label: "Stories", subtitle: "story quality and acceptance criteria coverage." }
};

export function CanvasHeader({
  project,
  mode,
  branch,
  lastRunAt,
  activeTab,
  onTabChange,
  counts,
  isSyncing
}: CanvasHeaderProps) {
  const meta = TAB_META[activeTab];
  const tabs: Array<{ id: DashboardTabId; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "features", label: "Features", count: counts.features },
    { id: "specs", label: "Stories", count: counts.specs }
  ];

  return (
    <>
      <div className="mb-[14px] flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 inline-flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--vs-text-dim)]">
            <span className="dot emerald" style={{ width: 6, height: 6 }} />
            Vindicate · {mode} mode · {project} · {branch}
          </div>
          <h2 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-[var(--vs-text-bright)]">
            {meta.label}
            <MetricTip
              title="Where every number on this page comes from"
              formula={
                "overall = 0.4*spec + 0.3*trace + 0.2*pass + 0.1*fresh\n\nNumbers update on every file save."
              }
              source="Sources: .vindicate/stories/*.story.md, tests, and Playwright results"
            />
          </h2>
          <div className="mt-1 text-xs text-[var(--vs-text-dim)]">{meta.subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--vs-text-dim)]">
            last run · {lastRunAt}
          </span>
          <button
            type="button"
            className="vbtn"
            onClick={() => !isSyncing && postToExtension({ type: "metrics:refresh" })}
            disabled={isSyncing}
            aria-busy={isSyncing}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
              className={isSyncing ? "animate-spin" : undefined}
            >
              <path d="M11.5 7a4.5 4.5 0 1 1-1.2-3.1" />
              <path d="M11.5 2.5v2.9H8.6" />
            </svg>
            {isSyncing ? "Syncing..." : "Sync"}
          </button>
          <button
            type="button"
            className="vbtn"
            onClick={() => postToExtension({ type: "nav:openRecordings" })}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <circle cx="7" cy="7" r="4.5" />
            </svg>
            Recordings
          </button>
          <button
            type="button"
            className="vbtn primary"
            onClick={() => postToExtension({ type: "tests:runAll" })}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <path d="M3 2.5v9l8-4.5z" />
            </svg>
            Run all tests
          </button>
        </div>
      </div>
      <div className="dash-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`dash-tab ${activeTab === tab.id ? "on" : ""}`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="count">{tab.count}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
