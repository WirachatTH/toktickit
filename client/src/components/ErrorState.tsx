import { ReactNode } from "react";

export interface ErrorStateProps {
  message: string;
  action?: ReactNode;
}

// A safe, generic failure message per BR-28 — callers must never pass raw
// server error detail (stack traces, SQL) through this component.
export function ErrorState({ message, action }: ErrorStateProps) {
  return (
    <div className="zg-error-state" role="alert">
      <p className="mb-3">{message}</p>
      {action}
    </div>
  );
}
