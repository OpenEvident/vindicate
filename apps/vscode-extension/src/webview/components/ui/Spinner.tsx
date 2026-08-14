export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span className={`vindicate-spinner ${className}`.trim()} role="status" aria-label="Loading" />
  );
}
