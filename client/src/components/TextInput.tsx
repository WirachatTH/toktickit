import { InputHTMLAttributes } from "react";
import { fieldClassName } from "./fieldClasses.js";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readOnly?: boolean;
  invalid?: boolean;
}

export function TextInput({ readOnly, invalid, className, ...rest }: TextInputProps) {
  return (
    <input
      type="text"
      readOnly={readOnly}
      aria-invalid={invalid || undefined}
      className={fieldClassName({ readOnly, invalid, className })}
      {...rest}
    />
  );
}
