import type { DashboardMetrics, FeatureStatus } from "../../../../shared/types";
import { ACBreakdown } from "../ACBreakdown";
import { MetricTip } from "../../shared/MetricTip";
import { postToExtension } from "../../../lib/bridge";

function headingRow(label: string, ok: boolean) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span
        className={[
          "inline-flex h-[13px] w-[13px] items-center justify-center rounded text-[9px]",
          ok
            ? "bg-[color-mix(in_oklab,var(--ord-emerald)_22%,transparent)] text-[var(--ord-emerald)]"
            : "bg-[color-mix(in_oklab,var(--ord-red)_18%,transparent)] text-[var(--ord-red)]"
        ].join(" ")}
      >
        {ok ? "✓" : "×"}
      </span>
      <span className={ok ? "text-[var(--vs-text)]" : "text-[var(--vs-text-dim)]"}>{label}</span>
    </div>
  );
}

function SpecCard({ feature, required }: { feature: FeatureStatus; required: string[] }) {
  const status =
    feature.specStatus === "complete"
      ? "Complete"
      : feature.specStatus === "partial"
        ? "Partial"
        : "Missing";
  const statusColor =
    feature.specStatus === "complete"
      ? "var(--ord-emerald)"
      : feature.specStatus === "partial"
        ? "var(--ord-amber)"
        : "var(--ord-red)";
  const headingValues: Record<string, boolean> = {
    Persona: feature.headings.persona,
    Feature: feature.headings.feature,
    "Acceptance Criteria": feature.headings.acceptanceCriteria,
    Testcases: feature.headings.testcases,
    "Out of Scope": feature.headings.outOfScope
  };

  return (
    <article className="rounded-[10px] border border-[var(--vs-border)] bg-[rgba(127,127,127,0.025)] p-[14px]">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`dot ${
              feature.specStatus === "complete"
                ? "emerald"
                : feature.specStatus === "partial"
                  ? "amber"
                  : "red"
            }`}
          />
          <span className="text-[13px] font-semibold text-[var(--vs-text)]">{feature.name}</span>
          <code className="font-mono text-[10px] text-[var(--vs-text-dim)]">/{feature.slug}</code>
        </div>
        <span className="text-[11px]" style={{ color: statusColor }}>
          {status}
        </span>
      </div>
      {feature.specStatus === "missing" ? (
        <div className="text-[11.5px] leading-[1.45] text-[var(--vs-text-dim)]">
          Feature is named in `domain.md` but no spec file exists yet.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {required.map((section) => headingRow(section, headingValues[section] ?? false))}
          </div>
          <div className="mt-2 border-t border-[var(--vs-border)] pt-2 font-mono text-[10.5px] text-[var(--vs-text-dim)]">
            {feature.ac} AC · {feature.words} words
          </div>
        </>
      )}
    </article>
  );
}

export function SpecsTab({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="flex flex-col gap-5">
      {metrics.storyWarnings.length > 0 && (
        <section>
          <div className="dash-section-h">
            <h4>
              Traceability warnings <span className="count">{metrics.storyWarnings.length}</span>
            </h4>
          </div>
          <div className="flex flex-col gap-2">
            {metrics.storyWarnings.map((warning, index) => (
              <button
                key={`${warning.file}-${warning.kind}-${index}`}
                type="button"
                className="alert warn w-full cursor-pointer text-left hover:opacity-95"
                onClick={() =>
                  postToExtension({
                    type: "nav:openFile",
                    file: warning.file,
                    ...(warning.line ? { line: warning.line } : {})
                  })
                }
                title="Open file in editor"
              >
                <div className="icon mt-1 h-2 w-2 rounded-full bg-[var(--ord-amber)]" />
                <div className="min-w-0 flex-1">
                  <div className="title">{warning.title}</div>
                  <div className="sub">
                    {warning.file}
                    {warning.line ? `:${warning.line}` : ""}
                    {warning.feature ? ` · ${warning.feature}` : ""} · {warning.detail}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="rounded-[10px] border border-[var(--vs-border)] bg-[rgba(127,127,127,0.025)] px-4 py-[14px]">
        <div className="mb-2 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--vs-text-dim)]">
          Required headings
          <MetricTip
            title="Spec schema"
            formula={`Every feature spec must include:\n${metrics.specSchema.required.map((h) => `## ${h}`).join("\n")}`}
            source="Defined by Vindicate's scoring rules"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {metrics.specSchema.required.map((heading) => (
            <span
              key={heading}
              className="rounded bg-[rgba(127,127,127,.1)] px-2 py-1 text-[11px] text-[var(--vs-text)]"
            >
              ## {heading}
            </span>
          ))}
        </div>
      </div>
      <ACBreakdown coverage={metrics.acCoverage} />
      <div>
        <div className="dash-section-h">
          <h4>
            Story status by feature <span className="count">{metrics.features.length}</span>
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {metrics.features.map((feature) => (
            <SpecCard key={feature.slug} feature={feature} required={metrics.specSchema.required} />
          ))}
        </div>
      </div>
    </div>
  );
}
