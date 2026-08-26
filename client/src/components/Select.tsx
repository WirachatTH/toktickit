import { KeyboardEvent, MouseEvent, SelectHTMLAttributes } from "react";
import { fieldClassName } from "./fieldClasses.js";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readOnly?: boolean;
  invalid?: boolean;
}

// Native <select readonly> is not honored by browsers. Using `disabled` for
// the read-only variant (as an earlier version of this component did) looks
// right but silently removes the control from tab order — every browser
// excludes disabled form controls from keyboard navigation entirely, unlike
// TextInput/TextArea's readOnly, which stays focusable. That breaks the
// "keyboard-accessible" requirement in a way no visual check would catch.
// Instead: keep it enabled and focusable, block the interactions that would
// change its value, and mark it aria-readonly for assistive tech.
//
// Known limitation: the native <select> popup is an OS-level widget in some
// browsers, so blocking mousedown is the best available approximation, not
// a 100% guarantee it can never visually open — it does reliably stop the
// value from changing via keyboard, which is the part that actually matters.
export function Select({ readOnly, invalid, disabled, className, children, onMouseDown, onKeyDown, ...rest }: SelectProps) {
  const blockMouseDown = (event: MouseEvent<HTMLSelectElement>) => {
    if (readOnly) event.preventDefault();
    onMouseDown?.(event);
  };

  const blockKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    // Tab must still move focus, Escape must still be able to dismiss an
    // already-open native dropdown (blocking it can leave the OS-level
    // picker stuck open), and Ctrl/Cmd combos (e.g. copy) are harmless.
    const allowed = event.key === "Tab" || event.key === "Escape" || event.metaKey || event.ctrlKey;
    if (readOnly && !allowed) {
      event.preventDefault();
    }
    onKeyDown?.(event);
  };

  return (
    <select
      disabled={disabled}
      aria-readonly={readOnly || undefined}
      aria-invalid={invalid || undefined}
      className={fieldClassName({ readOnly, invalid, className })}
      onMouseDown={blockMouseDown}
      onKeyDown={blockKeyDown}
      {...rest}
    >
      {children}
    </select>
  );
}
