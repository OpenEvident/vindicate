import type { ReactNode } from "react";

export type PillTone = "default" | "alert" | "emerald" | "blue" | "amber";

interface PillProps {
  readonly tone?: PillTone;
  readonly children: ReactNode;
}

const toneClasses: Record<PillTone, string> = {
  default: "bg-vs-hover/50 text-vs-text-dim border-vs-border",
  alert: "bg-tone-amber/10 text-tone-amber border-tone-amber/35",
  emerald: "bg-tone-emerald/15 text-tone-emerald border-tone-emerald/35",
  blue: "bg-tone-blue/15 text-tone-blue border-tone-blue/35",
  amber: "bg-tone-amber/15 text-tone-amber border-tone-amber/35"
};

export function Pill({ tone = "default", children }: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[9.5px] px-1.5 py-0.5",
        "rounded-full border leading-none",
        toneClasses[tone]
      ].join(" ")}
    >
      {children}
    </span>
  );
}
