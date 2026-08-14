import type { RecordingSession } from "@/lib/recording-ui-types";

interface StatsRowProps {
  readonly sessions: readonly RecordingSession[];
}

export function StatsRow({ sessions }: StatsRowProps) {
  const total     = sessions.length;
  const finalized = sessions.filter((s) => s.status === "finalized").length;
  const review    = sessions.filter((s) => s.status === "review").length;
  const totalSteps = sessions.reduce((n, s) => n + s.stepCount, 0);

  const stats = [
    { value: String(total),      unit: undefined,  label: "Total sessions" },
    { value: String(finalized),  unit: undefined,  label: "Finalized",     dot: "bg-tone-emerald" },
    { value: String(review),     unit: undefined,  label: "Needs review",  dot: "bg-tone-amber" },
    { value: String(totalSteps), unit: "steps",    label: "Captured total" },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-vs-border bg-vs-bg px-4 py-3.5"
        >
          <div className="flex items-baseline gap-1.5 text-[25px] font-semibold tracking-tight leading-none">
            {s.value}
            {s.unit !== undefined && (
              <span className="font-mono text-[11px] font-normal text-vs-text-dim">{s.unit}</span>
            )}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-vs-text-dim">
            {"dot" in s && s.dot !== undefined && (
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            )}
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
