interface SwitchProps {
  readonly on: boolean;
  readonly onChange: () => void;
  readonly label?: string;
  readonly disabled?: boolean;
}

export function Switch({ on, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-[34px] shrink-0 cursor-pointer rounded-full",
        "border-2 border-transparent transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-vs-accent" : "bg-vs-border",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm",
          "transition-transform duration-150",
          on ? "translate-x-[14px]" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
