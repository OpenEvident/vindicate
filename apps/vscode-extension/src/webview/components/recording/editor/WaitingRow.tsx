// Animated "waiting for next action" row shown at bottom of live recording timeline.
export function WaitingRow() {
  return (
    <div className="flex items-center gap-3.5 pt-0.5">
      {/* Dashed circle node */}
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
        style={{ border: "1.5px dashed color-mix(in oklab, var(--color-tone-red) 50%, var(--color-vs-border))" }}
      >
        <span className="w-2 h-2 rounded-full bg-tone-red animate-pulse-dot" />
      </div>

      {/* Shimmer bar */}
      <div className="flex flex-1 h-[46px] items-center rounded-xl border border-dashed border-vs-border px-3.5">
        <span className="animate-shimmer text-[11.5px] text-vs-text-dim">
          Listening for your next action…
        </span>
      </div>
    </div>
  );
}
