export type PopperSide = "top" | "bottom" | "left" | "right";

export const POPPER_OPPOSITE: Record<PopperSide, PopperSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left"
};

/**
 * Computes a fixed-position { top, left } for a popper (tooltip / popover)
 * relative to a trigger rect. Tries preferred side first, then opposite,
 * then remaining sides. Clamps to viewport with edgePad margin.
 */
export function computePopperPosition(
  trigger: DOMRect,
  popperW: number,
  popperH: number,
  preferred: PopperSide,
  gap = 6,
  edgePad = 8
): { top: number; left: number; placement: PopperSide } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = trigger.left + trigger.width / 2;
  const cy = trigger.top + trigger.height / 2;

  const slots: Record<PopperSide, { top: number; left: number }> = {
    top: { top: trigger.top - popperH - gap, left: cx - popperW / 2 },
    bottom: { top: trigger.bottom + gap, left: cx - popperW / 2 },
    left: { top: cy - popperH / 2, left: trigger.left - popperW - gap },
    right: { top: cy - popperH / 2, left: trigger.right + gap }
  };

  const fits = ({ top, left }: { top: number; left: number }) =>
    top >= edgePad &&
    left >= edgePad &&
    top + popperH <= vh - edgePad &&
    left + popperW <= vw - edgePad;

  const order: PopperSide[] = [
    preferred,
    POPPER_OPPOSITE[preferred],
    ...(["top", "bottom", "left", "right"] as PopperSide[]).filter(
      (s) => s !== preferred && s !== POPPER_OPPOSITE[preferred]
    )
  ];

  const chosen = order.find((s) => fits(slots[s])) ?? preferred;
  const { top, left } = slots[chosen];

  return {
    top: Math.max(edgePad, Math.min(top, vh - popperH - edgePad)),
    left: Math.max(edgePad, Math.min(left, vw - popperW - edgePad)),
    placement: chosen
  };
}
