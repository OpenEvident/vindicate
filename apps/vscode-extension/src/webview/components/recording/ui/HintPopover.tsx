import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { computePopperPosition, type PopperSide } from "@/lib/geometry";

interface HintPopoverProps {
  readonly title: string;
  readonly body: string;
  readonly side?: PopperSide;
}

const POPOVER_W = 224; // w-56

export function HintPopover({ title, body, side = "bottom" }: HintPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Measure popover (off-screen first pass) then snap into position
  useEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos(computePopperPosition(rect, POPOVER_W, popoverRef.current.offsetHeight, side));
  }, [open, side]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Learn about ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((v) => !v);
        }}
        className={[
          "flex items-center justify-center w-3.5 h-3.5 rounded-full cursor-pointer",
          "border-0 bg-transparent transition-colors duration-150",
          open ? "text-vs-text" : "text-vs-text-dim hover:text-vs-text"
        ].join(" ")}
      >
        <HelpCircle size={11} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={title}
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left, width: POPOVER_W, opacity: 1 }
                : { position: "fixed", top: -9999, left: -9999, width: POPOVER_W, opacity: 0 }
            }
            className={[
              "z-[9999] rounded-lg border border-vs-border bg-vs-sidebar",
              "p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]",
              "animate-pop"
            ].join(" ")}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <span className="text-ui-sm font-semibold text-vs-text leading-snug">{title}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="mt-px shrink-0 text-vs-text-dim hover:text-vs-text cursor-pointer border-0 bg-transparent transition-colors"
              >
                <X size={11} />
              </button>
            </div>
            <p className="text-[11px] text-vs-text-dim leading-relaxed">{body}</p>
          </div>,
          document.body
        )}
    </>
  );
}
