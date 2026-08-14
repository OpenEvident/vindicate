import { useEffect } from "react";

export function CompletionOverlay({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 2000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-vsc-bg/90 motion-reduce:transition-none"
      role="status"
      aria-live="polite"
    >
      <p className="animate-slide-in text-lg font-semibold text-vsc-fg motion-reduce:animate-none">
        Project setup complete
      </p>
    </div>
  );
}
