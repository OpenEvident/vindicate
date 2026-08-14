import { useRecordingStore } from "@/stores/recordingStore";

export function FinalCaptureCard() {
  const previewTarget       = useRecordingStore((s) => s.previewTarget);
  const finalScreenshotUrl  = useRecordingStore((s) => s.finalScreenshotUrl);
  const selectPreviewTarget = useRecordingStore((s) => s.selectPreviewTarget);

  const selected = previewTarget.type === "final";

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label="Final capture"
      onClick={() => selectPreviewTarget({ type: "final" })}
      className={[
        "mt-1.5 ml-12 grid w-[calc(100%-3rem)] cursor-pointer rounded-xl border p-3.5 text-left",
        "grid-cols-[76px_1fr] gap-3.5",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent",
        selected
          ? "border-vs-accent bg-vs-accent/5 shadow-[0_8px_26px_-12px_color-mix(in_oklab,var(--color-vs-accent)_55%,transparent)]"
          : "border-[color-mix(in_oklab,var(--color-vs-accent)_42%,var(--color-vs-border))] bg-vs-accent/5 hover:border-vs-accent",
      ].join(" ")}
    >
      {/* Thumbnail */}
      <div className="h-14 w-[76px] shrink-0 overflow-hidden rounded-lg border border-vs-border bg-[#1e1e1e]">
        {finalScreenshotUrl !== null ? (
          <img
            src={finalScreenshotUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-vs-text-dim">—</div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-tone-emerald/15 px-2 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-tone-emerald">
            Final
          </span>
          <span className="text-[12.5px] font-semibold">Final capture</span>
        </div>
        <p className="text-ui-sm text-vs-text-dim leading-relaxed">
          Page state when you stopped recording. Full element candidates are in the artifact.
        </p>
      </div>
    </button>
  );
}
