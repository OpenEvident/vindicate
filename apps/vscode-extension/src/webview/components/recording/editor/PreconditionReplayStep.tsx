import { RotateCcw } from "lucide-react";

interface PreconditionReplayStepProps {
  readonly index: number;
  readonly name: string;
  readonly showConnector: boolean;
}

export function PreconditionReplayStep({
  index,
  name,
  showConnector
}: PreconditionReplayStepProps) {
  return (
    <div className="flex gap-3.5" style={{ paddingBottom: showConnector ? 12 : 0 }}>
      <div className="flex flex-col items-center shrink-0" style={{ width: 34 }}>
        <div
          className={[
            "relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
            "font-mono text-[12.5px] font-semibold bg-vs-bg z-10",
            "text-tone-violet border-tone-violet/60"
          ].join(" ")}
        >
          {index}
        </div>
        {showConnector && (
          <div
            className="w-0.5 flex-1 min-h-[12px]"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-vs-border), color-mix(in oklab, var(--color-vs-border) 50%, transparent))"
            }}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="rounded-xl border border-tone-violet/25 bg-tone-violet/5">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-tone-violet/30 bg-tone-violet/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-tone-violet">
              <RotateCcw size={11} />
              Pre-condition
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-vs-text"
              title={name}
            >
              Replayed: {name}
            </span>
          </div>
          <div className="mx-3 mb-3 rounded-lg border border-tone-violet/20 bg-tone-violet/5 px-3 py-2 text-ui-sm leading-relaxed text-vs-text-dim">
            Setup replay from a saved recording. This is not a step in your new recording.
          </div>
        </div>
      </div>
    </div>
  );
}
