import { useEffect, useRef, useState } from "react";
import { postToExtension } from "../../lib/bridge";
import { getExtensionVersion, getLogoTextUri } from "../../lib/webviewAssets";
import { createEmptyDashboardMetrics } from "../../../shared/metricAvailability";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useHealthStore } from "../../stores/healthStore";
import { useOnboardingStore } from "../../stores/onboardingStore";
import { HealthRing } from "../shared/HealthRing";
import { MetricTip } from "../shared/MetricTip";

const EXT_VERSION = `v${getExtensionVersion()}`;

// ── Overflow ··· menu ───────────────────────────────────────────────────────
function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="vindicate-overflow-wrap" ref={ref}>
      <button
        type="button"
        className="vindicate-sidebar-icon-btn"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="2.5" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13.5" cy="8" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="vindicate-overflow-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="vindicate-overflow-item"
            onClick={() => { setOpen(false); postToExtension({ type: "nav:openFullView" }); }}
          >
            Open home page
          </button>
          <button
            type="button"
            role="menuitem"
            className="vindicate-overflow-item"
            onClick={() => { setOpen(false); postToExtension({ type: "nav:openRecordings" }); }}
          >
            Recordings
          </button>
          <button
            type="button"
            role="menuitem"
            className="vindicate-overflow-item"
            onClick={() => { setOpen(false); postToExtension({ type: "nav:showPanel" }); }}
          >
            Prompts &amp; Config
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarHealthBadge() {
  const metrics = useDashboardStore((s) => s.metrics) ?? createEmptyDashboardMetrics();
  const delta = metrics.health.delta;
  const hasDelta = delta !== 0;
  return (
    <div className="sb-health mt-1">
      <div className="ring">
        <HealthRing score={metrics.health.overall} size={38} stroke={4} />
        <div className="num">{metrics.health.overall}</div>
      </div>
      <div>
        <div className="title inline-flex items-center">
          Project health
          <span className="ml-1 font-mono text-[11px] text-[var(--vs-text-dim)]">· {metrics.health.grade}</span>
        </div>
        <div className="sub">
          {hasDelta ? (
            <>
              {delta >= 0 ? "▲" : "▼"}
              {delta >= 0 ? "+" : ""}
              {Math.abs(delta)} vs last run
            </>
          ) : (
            "no change vs last run"
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarSectionTitle({
  children,
  right
}: {
  children: string;
  right?: string;
}) {
  return (
    <div className="sb-section-title">
      <span>{children}</span>
      {right ? <span>{right}</span> : null}
    </div>
  );
}

function ProjectChip() {
  const folderName = useOnboardingStore((s) => s.folderName) ?? "workspace";
  const mode = (useOnboardingStore((s) => s.mode) ?? "build").toUpperCase();
  const metrics = useDashboardStore((s) => s.metrics) ?? createEmptyDashboardMetrics();
  const branch = metrics.branch || "main";

  return (
    <div className="sb-project-chip">
      <div className="sb-project-logo" aria-hidden>
        O
      </div>
      <div className="min-w-0 flex-1">
        <div className="sb-project-name">{folderName}</div>
        <div className="sb-project-meta">
          {mode} · {branch}
        </div>
      </div>
      <span className="sb-project-chevron" aria-hidden>
        ›
      </span>
    </div>
  );
}

function SidebarQuickKPIs() {
  const metrics = useDashboardStore((s) => s.metrics) ?? createEmptyDashboardMetrics();
  const toneFor = (value: number, ready: boolean): "emerald" | "amber" | "red" => {
    if (!ready) return "red";
    if (value >= 85) return "emerald";
    if (value >= 70) return "amber";
    return "red";
  };
  const rows = [
    {
      label: "Specs",
      value: `${metrics.health.spec.value}%`,
      tone: toneFor(metrics.health.spec.value, metrics.health.spec.ready)
    },
    {
      label: "Traceability",
      value: `${metrics.health.trace.value}%`,
      tone: toneFor(metrics.health.trace.value, metrics.health.trace.ready)
    },
    {
      label: "Pass rate",
      value: `${metrics.health.pass.value}%`,
      tone: toneFor(metrics.health.pass.value, metrics.health.pass.ready)
    },
    {
      label: "Freshness",
      value: metrics.tests.lastRunAt,
      tone: toneFor(metrics.health.fresh.value, metrics.health.fresh.ready)
    }
  ];
  return (
    <div className="mt-3">
      <SidebarSectionTitle>Score breakdown</SidebarSectionTitle>
      {rows.map((row) => (
        <div key={row.label} className="sb-metric">
          <span className="lbl inline-flex items-center">
            <span className={`dot ${row.tone}`} />
            {row.label}
            <MetricTip title={`${row.label} metric`} formula="Calculated from dashboard metrics data." />
          </span>
          <span className="val">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SidebarFeatureList() {
  const metrics = useDashboardStore((s) => s.metrics) ?? createEmptyDashboardMetrics();
  return (
    <div className="mt-3">
      <SidebarSectionTitle right={`${metrics.features.length} features`}>Features</SidebarSectionTitle>
      {metrics.features.map((feature) => (
        <div key={feature.slug} className="sb-feat-row">
          <span className={`dot ${feature.specStatus === "missing" ? "red" : feature.specStatus === "partial" ? "amber" : "emerald"}`} />
          <span className="name">{feature.slug}</span>
          <span className="tcount">{feature.tests.total > 0 ? `${feature.tests.passed}/${feature.tests.total}` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function SidebarQuickActions() {
  const isSyncing = useDashboardStore((s) => s.isLoading);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <SidebarSectionTitle>Quick actions</SidebarSectionTitle>
      <button
        type="button"
        className="vbtn primary full"
        onClick={() => postToExtension({ type: "tests:runAll" })}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <path d="M3 2.5v9l8-4.5z" />
        </svg>
        Run all tests
      </button>
      <button
        type="button"
        className="vbtn full"
        onClick={() => postToExtension({ type: "nav:openRecordings" })}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
        </svg>
        Open recordings
      </button>
      <button
        type="button"
        className="vbtn full"
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
        {isSyncing ? "Syncing..." : "Sync from disk"}
      </button>
    </div>
  );
}

// ── Status footer ───────────────────────────────────────────────────────────
function StatusFooter() {
  const runtime = useHealthStore((s) => s.runtime);
  const mcp = useHealthStore((s) => s.mcp);

  const dotClass = (s: string) =>
    s === "up" ? "vindicate-status-dot--green" : s === "down" ? "vindicate-status-dot--red" : "vindicate-status-dot--gray";

  const mcpPulse = mcp === "down";

  return (
    <div className="vindicate-status-footer">
      <span className="vindicate-service-status" title="Vindicate runtime – local service that orchestrates scaffolding">
        <span className={`vindicate-status-dot ${dotClass(runtime)}`} aria-hidden />
        Runtime
      </span>
      <span className="vindicate-service-status" title="Vindicate MCP server – exposes context to your AI agents">
        <span className={`vindicate-status-dot ${dotClass(mcp)} ${mcpPulse ? "vindicate-status-dot--pulse" : ""}`} aria-hidden />
        MCP
      </span>
      <span className="vindicate-status-footer-spacer" />
      <span className="vindicate-status-footer-version">{EXT_VERSION}</span>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
export function SidebarView() {
  const logoTextUri = getLogoTextUri();
  const hasFolder = useOnboardingStore((s) => s.hasFolder);
  const onboardingDone = useOnboardingStore((s) => s.onboardingDone);

  return (
    <div className="vindicate-sidebar">
      {/* Header */}
      <header className="vindicate-sidebar-header">
        <div className="vindicate-sidebar-header-title">
          {logoTextUri ? (
            <img src={logoTextUri} alt="Vindicate" className="vindicate-sidebar-logo" />
          ) : (
            <span className="vindicate-sidebar-brand">Vindicate</span>
          )}
        </div>
        <OverflowMenu />
      </header>

      {/* Scrollable body */}
      <div className="vindicate-sidebar-body">
        {!hasFolder ? (
          <div className="vindicate-sidebar-empty vindicate-sidebar-nofolder-card">
            <p className="vindicate-sidebar-empty-title">Open a workspace to begin</p>
            <p className="vindicate-sidebar-empty-desc">
              Vindicate needs a project folder to configure onboarding, prompts, and file-watching.
            </p>
            <button
              type="button"
              className="vindicate-btn-primary"
              aria-label="Open folder"
              onClick={() => postToExtension({ type: "nav:openFolder" })}
            >
              Open Folder
            </button>
          </div>
        ) : (
          <>
            {onboardingDone ? (
              <>
                <ProjectChip />
                <SidebarHealthBadge />
                <SidebarQuickKPIs />
                <SidebarFeatureList />
                <SidebarQuickActions />
              </>
            ) : (
              /* Onboarding CTA — directs user to the home panel */
              <div className="vindicate-sidebar-onboarding-cta">
                <p className="vindicate-sidebar-onboarding-title">Setup in progress</p>
                <p className="vindicate-sidebar-onboarding-desc">
                  Complete the onboarding steps to activate your workspace.
                </p>
                <button
                  type="button"
                  className="vindicate-btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => postToExtension({ type: "nav:openFullView" })}
                >
                  Continue setup →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Status footer pinned to bottom */}
      <StatusFooter />
    </div>
  );
}
