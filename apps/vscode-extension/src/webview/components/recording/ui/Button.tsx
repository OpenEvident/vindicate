import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize    = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-vs-accent text-white border-transparent hover:brightness-110",
  ghost:   "bg-transparent text-vs-text-dim border-vs-border hover:text-vs-text hover:bg-vs-hover",
  danger:  "bg-transparent text-vs-text-dim border-vs-border hover:text-tone-red hover:bg-tone-red/10 hover:border-tone-red/35",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-ui-sm gap-1.5",
  md: "px-3.5 py-1.5 text-ui-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "ghost", size = "md", loading = false, className = "", disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled === true || loading}
      className={[
        "inline-flex items-center justify-center rounded-md border font-medium",
        "transition-all duration-150 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading && <Loader2 size={size === "sm" ? 12 : 14} className="animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
