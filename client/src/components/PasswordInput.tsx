import { forwardRef, InputHTMLAttributes, useState } from "react";
import { fieldClassName } from "./fieldClasses.js";

// Lab 3 ui-spec.md §3, §10 — a password field with a show/hide toggle. The
// toggle is a real button with a changing label and aria-pressed, so screen
// readers announce what it does and whether the password is visible.

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { invalid, className, disabled, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="zg-password">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        aria-invalid={invalid || undefined}
        className={fieldClassName({ invalid, className })}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        className="btn zg-btn-tertiary zg-password-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
});
