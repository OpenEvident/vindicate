export function SkeletonBlock({ className = "h-16" }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={`animate-pulse rounded bg-vsc-input-bg motion-reduce:animate-none ${className}`}
    />
  );
}
