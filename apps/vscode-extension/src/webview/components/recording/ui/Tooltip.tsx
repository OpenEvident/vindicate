import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { computePopperPosition, type PopperSide } from "@/lib/geometry";

interface TooltipProps {
  readonly content: string;
  readonly children: ReactNode;
  /** Preferred side — auto-flips when there isn't enough space */
  readonly side?: PopperSide;
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  // Measure tooltip (rendered off-screen at first) then snap into position
  useEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = tooltipRef.current;
    setPos(computePopperPosition(rect, w, h, side));
  }, [open, side]);

  const show = () => {
    setPos(null);
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </span>

      {open &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left, opacity: 1 }
                : { position: "fixed", top: -9999, left: -9999, opacity: 0 }
            }
            className={[
              "z-[9999] pointer-events-none whitespace-nowrap",
              "rounded-md border border-vs-border bg-vs-sidebar",
              "px-2 py-1 text-[10.5px] text-vs-text shadow-lg",
              "transition-opacity duration-150"
            ].join(" ")}
          >
            {content}
          </span>,
          document.body
        )}
    </>
  );
}
