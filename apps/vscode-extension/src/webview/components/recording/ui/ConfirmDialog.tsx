import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Destructive styling on the confirm button */
  readonly danger?: boolean;
  readonly secondaryLabel?: string;
  /** Destructive styling on the secondary button */
  readonly secondaryDanger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onSecondary?: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  secondaryLabel,
  secondaryDanger = false,
  onConfirm,
  onCancel,
  onSecondary
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button on mount; close on Escape
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    // Backdrop
    <div
      role="presentation"
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-[fade-in_120ms_ease]"
      onClick={onCancel}
    >
      {/* Dialog panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onClick={(e) => e.stopPropagation()}
        className={[
          "relative w-[340px] rounded-2xl border border-vs-border bg-vs-sidebar",
          "px-6 py-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]",
          "animate-pop"
        ].join(" ")}
      >
        {/* Icon + title */}
        <div className="mb-3 flex items-center gap-2.5">
          {danger && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tone-red/10">
              <AlertTriangle size={15} className="text-tone-red" />
            </span>
          )}
          <h2 id="confirm-dialog-title" className="text-[13.5px] font-semibold leading-snug">
            {title}
          </h2>
        </div>

        {/* Message */}
        <p id="confirm-dialog-desc" className="mb-5 text-[12px] leading-relaxed text-vs-text-dim">
          {message}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {onSecondary !== undefined && secondaryLabel !== undefined && (
            <button
              type="button"
              onClick={onSecondary}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5",
                "text-[12px] font-semibold cursor-pointer transition-all duration-150",
                secondaryDanger
                  ? "border-tone-red/40 bg-tone-red/10 text-tone-red hover:bg-tone-red/20"
                  : "border-vs-border bg-vs-hover text-vs-text-dim hover:text-vs-text"
              ].join(" ")}
            >
              {secondaryLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5",
              "text-[12px] font-semibold cursor-pointer transition-all duration-150",
              danger
                ? "border-tone-red/40 bg-tone-red/10 text-tone-red hover:bg-tone-red/20"
                : "border-vs-accent/40 bg-vs-accent/10 text-vs-accent hover:bg-vs-accent/20"
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
