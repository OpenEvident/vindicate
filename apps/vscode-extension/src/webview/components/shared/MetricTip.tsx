import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePopperPosition, type PopperSide } from "@/lib/geometry";

interface MetricTipProps {
  title: string;
  formula?: string;
  source?: string;
  width?: number;
  icon?: string;
}

interface TooltipLayout {
  top: number;
  left: number;
  width: number;
  arrowLeft: number;
  placement: PopperSide;
}

function computeTooltipLayout(
  anchorRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
): TooltipLayout {
  const width = Math.min(tooltipWidth, window.innerWidth - 16);
  const { top, left, placement } = computePopperPosition(
    anchorRect,
    width,
    tooltipHeight,
    "top",
    8,
    8
  );
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowLeft = Math.max(12, Math.min(width - 12, anchorCenterX - left));

  return { top, left, width, arrowLeft, placement };
}

export function MetricTip({ title, formula, source, width = 280, icon = "i" }: MetricTipProps) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<TooltipLayout | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!open || anchorRef.current === null || tooltipRef.current === null) {
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const height = tooltipRef.current.offsetHeight;
    setLayout(computeTooltipLayout(rect, width, height));
  }, [open, width, title, formula, source]);

  function show(): void {
    setLayout(null);
    setOpen(true);
  }

  const arrowStyle =
    layout?.placement === "bottom"
      ? {
          bottom: "100%",
          left: layout.arrowLeft,
          transform: "translateX(-50%)",
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderBottom: "6px solid #16161a",
          filter: "drop-shadow(0 -1px 0 rgba(255,255,255,0.10))"
        }
      : {
          top: "100%",
          left: layout?.arrowLeft ?? 0,
          transform: "translateX(-50%)",
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid #16161a",
          filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.10))"
        };

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => {
        setOpen(false);
        setLayout(null);
      }}
      onFocus={show}
      onBlur={() => {
        setOpen(false);
        setLayout(null);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: "help",
        outline: "none",
        verticalAlign: "middle"
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          borderRadius: "50%",
          border: "1px solid var(--vs-border)",
          fontFamily: "var(--font-mono)",
          fontSize: 8.5,
          fontWeight: 600,
          color: "var(--vs-text-dim)",
          flexShrink: 0,
          background: "rgba(127,127,127,0.06)",
          lineHeight: 1,
          letterSpacing: 0,
          marginLeft: 4
        }}
        aria-label={title}
      >
        {icon}
      </span>
      {open &&
        createPortal(
          <span
            ref={tooltipRef}
            style={{
              position: "fixed",
              top: layout?.top ?? -9999,
              left: layout?.left ?? -9999,
              width: layout?.width ?? width,
              padding: "11px 13px",
              background: "#16161a",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 9,
              boxShadow: "0 16px 40px -8px rgba(0,0,0,.65), 0 2px 6px rgba(0,0,0,.4)",
              zIndex: 10000,
              pointerEvents: "none",
              textAlign: "left",
              fontFamily: "var(--font-sans)",
              opacity: layout === null ? 0 : 1
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#f5f5f5",
                marginBottom: formula || source ? 7 : 0,
                lineHeight: 1.35
              }}
            >
              {title}
            </span>
            {formula && (
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "#dcdce0",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  padding: "7px 9px",
                  borderRadius: 6,
                  marginBottom: source ? 7 : 0,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap"
                }}
              >
                {formula}
              </span>
            )}
            {source && (
              <span
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 5,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "#888",
                  lineHeight: 1.45
                }}
              >
                <span style={{ color: "#666", flexShrink: 0 }}>↳</span>
                <span>{source}</span>
              </span>
            )}
            {layout !== null && (
              <span
                style={{
                  position: "absolute",
                  width: 0,
                  height: 0,
                  ...arrowStyle
                }}
              />
            )}
          </span>,
          document.body
        )}
    </span>
  );
}
