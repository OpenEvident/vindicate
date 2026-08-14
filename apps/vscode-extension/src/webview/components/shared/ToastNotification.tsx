import { useEffect } from "react";

export function ToastNotification({
  message,
  onDismiss,
  durationMs = 4000
}: {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  return (
    <div
      role="status"
      className="animate-slide-in fixed right-3 top-3 z-50 max-w-xs rounded border border-vsc-border bg-vsc-input-bg px-3 py-2 text-sm text-vsc-fg shadow motion-reduce:animate-none"
    >
      {message}
    </div>
  );
}
