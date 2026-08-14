import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button, type ButtonSize, type ButtonVariant } from "./Button";

interface CopyButtonProps {
  readonly text: string;
  readonly label?: string;
  readonly copiedLabel?: string;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  readonly iconSize?: number;
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  size = "sm",
  variant = "ghost",
  iconSize
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resolvedIconSize = iconSize ?? (size === "sm" ? 11 : 13);

  const handleClick = async () => {
    if (text.length === 0) {
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => void handleClick()}
      aria-live="polite"
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? (
        <>
          <Check size={resolvedIconSize} className="text-tone-emerald shrink-0" aria-hidden />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy size={resolvedIconSize} className="shrink-0" aria-hidden />
          {label}
        </>
      )}
    </Button>
  );
}
