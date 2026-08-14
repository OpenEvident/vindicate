import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy prompt",
  compact = false
}: {
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const className = compact
    ? "vindicate-btn-copy"
    : "rounded bg-vsc-btn-bg px-3 py-1.5 text-vsc-btn-fg hover:bg-vsc-btn-hover focus:outline focus:outline-2 focus:outline-vsc-accent";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label={copied ? "Copied" : label}
      className={className}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
