import { TextareaHTMLAttributes } from "react";
import { fieldClassName } from "./fieldClasses.js";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readOnly?: boolean;
  invalid?: boolean;
}

export function TextArea({ readOnly, invalid, className, ...rest }: TextAreaProps) {
  return (
    <textarea
      readOnly={readOnly}
      aria-invalid={invalid || undefined}
      className={fieldClassName({ readOnly, invalid, className })}
      {...rest}
    />
  );
}
