import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  /** Shown in place of children while busy, e.g. "Submitting…". */
  busyLabel?: string;
}

// Every button variant/state in docs/lab-02/ui-spec.md §4 in one component,
// so Create Ticket (Issue 5) and later screens never hand-roll button styling.
export function Button({
  variant = "primary",
  busy = false,
  busyLabel,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = ["btn", `zg-btn-${variant}`, busy && "zg-btn--busy", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="zg-spinner" aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
