import type { FeatureStatus } from "../../../shared/types";
import { MetricTip } from "../shared/MetricTip";

interface FeatureMatrixProps {
  features: FeatureStatus[];
}

function passRate(feature: FeatureStatus): number | null {
  if (feature.tests.total <= 0) return null;
  return Math.round((feature.tests.passed / feature.tests.total) * 100);
}

function ratio(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return (count / total) * 100;
}

export function FeatureMatrix({ features }: FeatureMatrixProps) {
  return (
    <section>
      <div className="dash-section-h">
        <h4>
          Feature matrix
          <span className="count">
            {features.length}
          </span>
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-[var(--vs-text-dim)]">
          <span><span className="dot emerald" /> healthy</span>
          <span><span className="dot amber" /> partial</span>
          <span><span className="dot red" /> blocked</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[var(--vs-border)]">
        <table className="feat-table">
          <thead>
            <tr>
              <th style={{ width: "28%" }}>Feature</th>
              <th style={{ width: "10%" }}>
                <span className="inline-flex items-center">
                  AC
                  <MetricTip
                    title="Acceptance criteria count"
                    formula={"Count of AC-N lines under the\nAcceptance Criteria heading."}
                    source=".vindicate/stories/{feature}.story.md"
                  />
                </span>
              </th>
              <th style={{ width: "14%" }}>
                <span className="inline-flex items-center">
                  Spec
                  <MetricTip
                    title="Spec status"
                    formula={"complete = all required headings\npartial = some headings\nmissing = no spec file"}
                    source="Persona, Feature, Acceptance Criteria, Testcases, Out of Scope"
                  />
                </span>
              </th>
              <th style={{ width: "12%" }}>
                <span className="inline-flex items-center">
                  Tests
                  <MetricTip
                    title="Test count"
                    formula={"passed / total\n\nFeature tests are linked by slug and AC tags."}
                    source="tests/**/*.spec.ts"
                  />
                </span>
              </th>
              <th style={{ width: "20%" }}>
                <span className="inline-flex items-center">
                  Pass rate
                  <MetricTip
                    title="Per-feature pass rate"
                    formula="passed / total in latest run"
                    source="test-results.json"
                  />
                </span>
              </th>
              <th style={{ width: "16%" }}>
                <span className="inline-flex items-center">
                  Last touched
                  <MetricTip
                    title="Last edit time"
                    formula="Last update timestamp for the feature spec."
                    source="git log or file mtime fallback"
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => {
              const pct = passRate(feature);
              const specLabel =
                feature.specStatus === "complete" ? "Complete" : feature.specStatus === "partial" ? "Partial" : "Missing";
              const specTone =
                feature.specStatus === "complete"
                  ? "var(--ord-emerald)"
                  : feature.specStatus === "partial"
                    ? "var(--ord-amber)"
                    : "var(--ord-red)";
              const tone = feature.specStatus === "complete" && feature.tests.failed === 0 ? "emerald" : feature.specStatus === "missing" ? "red" : "amber";
              return (
                <tr key={feature.slug}>
                  <td>
                    <div className="feat-name">
                      <span className={`dot ${tone}`} />
                      <span>{feature.name}</span>
                      <span className="feat-slug">/{feature.slug}</span>
                    </div>
                  </td>
                  <td className="num-cell">{feature.ac}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: specTone }}>
                      <span>
                        {feature.specStatus === "complete" ? "●" : feature.specStatus === "partial" ? "◐" : "○"}
                      </span>
                      <span>{specLabel}</span>
                    </span>
                  </td>
                  <td className="num-cell">
                    {feature.tests.total > 0 ? (
                      <>
                        {feature.tests.passed}/{feature.tests.total}
                        {feature.tests.failed > 0 && (
                          <span style={{ color: "var(--ord-red)", marginLeft: 6 }}>✗{feature.tests.failed}</span>
                        )}
                      </>
                    ) : feature.linkedTests > 0 ? (
                      <span style={{ color: "var(--vs-text-dim)" }}>{feature.linkedTests} linked</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    title={`Passed: ${feature.tests.passed} | Failed: ${feature.tests.failed} | Flaky: ${feature.tests.flaky} | Skipped: ${feature.tests.skipped}`}
                  >
                    {pct === null ? (
                      <span className="font-mono text-[11px] text-[var(--vs-text-dim)]">not run</span>
                    ) : (
                      <div className="pass-bar">
                        <div className="bar" style={{ display: "flex" }}>
                          <span
                            style={{ width: `${ratio(feature.tests.passed, feature.tests.total)}%`, background: "var(--ord-emerald)" }}
                          />
                          <span
                            style={{ width: `${ratio(feature.tests.failed, feature.tests.total)}%`, background: "var(--ord-red)" }}
                          />
                          <span
                            style={{ width: `${ratio(feature.tests.flaky, feature.tests.total)}%`, background: "var(--ord-amber)" }}
                          />
                          <span
                            style={{ width: `${ratio(feature.tests.skipped, feature.tests.total)}%`, background: "var(--vs-text-dim)" }}
                          />
                        </div>
                        <span className="num-cell" style={{ width: 36, textAlign: "right" }}>{pct}%</span>
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--vs-text-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {feature.lastTouched ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
