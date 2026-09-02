import { cloneElement, isValidElement, ReactNode } from "react";

export interface FormFieldProps {
  htmlFor: string;
  label: string;
  required?: boolean;
  /** Rendered directly below the control — never the only required-field indicator (ui-spec.md §8.3). */
  error?: string;
  children: ReactNode;
}

interface FieldElementProps {
  id?: string;
  invalid?: boolean;
  "aria-describedby"?: string;
  [key: string]: unknown;
}

// Label + required asterisk + control slot + inline validation message,
// in the exact arrangement docs/lab-02/ui-spec.md §3 requires: the asterisk
// never substitutes for the message, and the message sits next to its field.
//
// The child field is auto-wired to the error (id, aria-describedby,
// invalid) rather than left to every caller to remember — a message that's
// only visually near its field but not programmatically associated with it
// is invisible to screen readers, and that gap won't show up in a visual
// QA pass.
export function FormField({ htmlFor, label, required, error, children }: FormFieldProps) {
  const errorId = `${htmlFor}-error`;

  const field = isValidElement<FieldElementProps>(children)
    ? cloneElement(children, {
        id: children.props.id ?? htmlFor,
        invalid: error ? true : children.props.invalid,
        "aria-describedby": error
          ? [children.props["aria-describedby"], errorId].filter(Boolean).join(" ")
          : children.props["aria-describedby"],
      })
    : children;

  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="zg-label">
        {label}
        {required && (
          <span className="zg-required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {field}
      {error && (
        <span id={errorId} className="zg-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
