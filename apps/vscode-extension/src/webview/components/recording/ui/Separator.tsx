interface SeparatorProps {
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
}

export function Separator({ orientation = "horizontal", className = "" }: SeparatorProps) {
  return orientation === "horizontal" ? (
    <div className={`h-px w-full bg-vs-border ${className}`} role="separator" />
  ) : (
    <div className={`w-px self-stretch bg-vs-border ${className}`} role="separator" />
  );
}
