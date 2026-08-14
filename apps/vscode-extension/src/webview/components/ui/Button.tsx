import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "vindicate-btn-primary",
  secondary: "vindicate-btn-secondary"
};

export function Button({
  variant = "primary",
  fullWidth = true,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[variantClass[variant], fullWidth ? "w-full" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
