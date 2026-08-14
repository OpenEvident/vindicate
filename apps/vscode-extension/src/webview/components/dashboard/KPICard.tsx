import { MetricTip } from "../shared/MetricTip";

interface KPICardProps {
  label: string;
  value: string | number;
  sub: string;
  unit?: string;
  weight?: number;
  tone?: "green" | "amber" | "red" | "flat";
  delta?: string;
  sparkline?: number[];
  tip?: { title: string; formula?: string; source?: string };
}

function barClass(tone: KPICardProps["tone"]): string {
  if (tone === "amber") return "bg-[var(--ord-amber)]";
  if (tone === "red") return "bg-[var(--ord-red)]";
  if (tone === "flat") return "bg-[var(--vs-text-dim)]";
  return "bg-[var(--ord-emerald)]";
}

export function KPICard({ label, value, sub, unit, weight, tone = "green", delta, sparkline, tip }: KPICardProps) {
  const numeric = typeof value === "number" ? Math.max(0, Math.min(value, 100)) : null;
  const deltaClass = delta?.startsWith("+") ? "up" : delta?.startsWith("-") ? "down" : "flat";
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  const showProgressBar = numeric !== null && unit === "%";

  return (
    <article className="kpi">
      <div className="kpi-label">
        <span className="inline-flex items-center">
          {label}
          {tip && (
            <MetricTip
              title={tip.title}
              {...(tip.formula ? { formula: tip.formula } : {})}
              {...(tip.source ? { source: tip.source } : {})}
            />
          )}
        </span>
        {weight !== undefined && <span className="font-mono text-[9px]">x{weight}%</span>}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="ml-1 text-sm text-[var(--vs-text-dim)]">{unit}</span>}
        {delta && (
          <span className={`kpi-delta ${deltaClass}`}>
            {deltaClass === "up" ? "▲" : deltaClass === "down" ? "▼" : "—"} {delta.replace(/^[+-]/, "")}
          </span>
        )}
      </div>
      {showProgressBar && (
        <div className={`kpi-bar ${tone === "green" ? "green" : tone === "amber" ? "amber" : tone === "red" ? "red" : ""}`}>
          <span className={`block h-full ${barClass(tone)}`} style={{ width: `${numeric}%` }} />
        </div>
      )}
      {sparkline && (
        <div className="spark" style={{ color: "var(--ord-emerald)" }}>
          {sparkline.map((point, index) => (
            <span
              key={`${point}-${index}`}
              className={index === sparkline.length - 1 ? "last" : ""}
              style={{ height: `${(point / max) * 100}%` }}
            />
          ))}
        </div>
      )}
      <div className="kpi-sub">{sub}</div>
    </article>
  );
}
