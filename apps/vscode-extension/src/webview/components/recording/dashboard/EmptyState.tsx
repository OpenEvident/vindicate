import { Camera, ScanSearch, Sparkles } from "lucide-react";

const STEPS = [
  {
    id: "record",
    Icon: Camera,
    step: "01",
    accentColor: "text-tone-red",
    dotColor: "bg-tone-red",
    ringColor: "ring-tone-red/20",
    title: "Record",
    desc: "Open a browser and click around. Every step gets recorded automatically."
  },
  {
    id: "review",
    Icon: ScanSearch,
    step: "02",
    accentColor: "text-tone-blue",
    dotColor: "bg-tone-blue",
    ringColor: "ring-tone-blue/20",
    title: "Review",
    desc: "Remove unwanted steps and pick the best locator for each action."
  },
  {
    id: "generate",
    Icon: Sparkles,
    step: "03",
    accentColor: "text-tone-emerald",
    dotColor: "bg-tone-emerald",
    ringColor: "ring-tone-emerald/20",
    title: "Generate",
    desc: "Export a clean file your agent uses to write tests."
  }
] as const;

interface EmptyStateProps {
  readonly onNewRecording: () => void;
}

export function EmptyState({ onNewRecording }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-10 px-4 select-none">
      {/* Headline block */}
      <div className="mb-8 text-center">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-vs-text-dim">
          No recordings yet
        </p>
        <h2 className="text-[1.25rem] font-semibold tracking-tight leading-snug">
          Start your first workflow
        </h2>
      </div>

      {/* Steps — horizontal timeline */}
      <div className="mb-8 flex w-full max-w-[640px] items-start">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex flex-1 items-start">
            {/* Step column */}
            <div className="flex flex-1 flex-col items-center gap-3 text-center">
              {/* Icon circle */}
              <div
                className={[
                  "flex h-11 w-11 items-center justify-center rounded-full",
                  "ring-[6px]",
                  step.ringColor,
                  "bg-vs-hover border border-vs-border"
                ].join(" ")}
              >
                <step.Icon size={17} className={step.accentColor} />
              </div>

              {/* Step number + title */}
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className={[
                    "font-mono text-[9px] uppercase tracking-[0.12em]",
                    step.accentColor
                  ].join(" ")}
                >
                  {step.step}
                </span>
                <span className="text-[12.5px] font-semibold">{step.title}</span>
              </div>

              {/* Description */}
              <p className="max-w-[160px] text-[11px] leading-relaxed text-vs-text-dim">
                {step.desc}
              </p>
            </div>

            {/* Connector line between steps */}
            {i < STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className="mt-[22px] mx-1 h-px flex-[0_0_24px] border-t border-dashed border-vs-border opacity-60"
              />
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onNewRecording}
        className={[
          "inline-flex items-center gap-2 rounded-xl px-5 py-2.5",
          "bg-tone-red text-white text-[12.5px] font-semibold border-0 cursor-pointer",
          "shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--color-tone-red)_60%,transparent)]",
          "transition-all duration-150 hover:brightness-110 hover:-translate-y-px active:translate-y-0"
        ].join(" ")}
      >
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white/80" />
        New recording
      </button>
    </div>
  );
}
