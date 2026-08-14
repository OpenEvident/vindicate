import type { AcceptanceCriteriaCoverage } from "../../../shared/types";
import { MetricTip } from "../shared/MetricTip";

export function ACBreakdown({ coverage }: { coverage: AcceptanceCriteriaCoverage }) {
  const pct = coverage.total === 0 ? 0 : Math.round((coverage.covered / coverage.total) * 100);
  return (
    <section>
      <div className="dash-section-h">
        <h4>
          Acceptance criteria coverage
          <MetricTip
            title="Acceptance criteria coverage"
            formula="covered / total"
            source="Cross-referenced between specs and tests"
          />
        </h4>
        <span className="font-mono text-[11px] text-[var(--vs-text-dim)]">
          {coverage.covered}/{coverage.total} traced · {pct}%
        </span>
      </div>
      <article className="rounded-[10px] border border-[var(--vs-border)] bg-[rgba(127,127,127,0.025)] p-[14px]">
        <div className="mb-3 flex h-7 overflow-hidden rounded">
          <span style={{ flex: coverage.covered }} className="bg-[var(--ord-emerald)]" />
          <span style={{ flex: coverage.drift }} className="bg-[var(--ord-amber)]" />
          <span style={{ flex: coverage.missing }} className="bg-[var(--ord-red)]" />
        </div>
        <div className="flex flex-wrap gap-[18px] text-[11.5px]">
          <span className="inline-flex items-center gap-1.5 text-[var(--vs-text-dim)]">
            <span className="dot emerald" /> Traced · {coverage.covered}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--vs-text-dim)]">
            <span className="dot amber" /> Drifted · {coverage.drift}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--vs-text-dim)]">
            <span className="dot red" /> Missing · {coverage.missing}
          </span>
        </div>
      </article>
    </section>
  );
}
