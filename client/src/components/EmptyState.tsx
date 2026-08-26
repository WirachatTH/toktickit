import { ReactNode } from "react";

export interface EmptyStateProps {
  message: string;
  action?: ReactNode;
}

// Distinct from ErrorState and from a filtered "no results" message —
// ui-spec.md §6.4 requires empty vs. no-results to read differently.
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="zg-empty-state">
      <p className="mb-3">{message}</p>
      {action}
    </div>
  );
}
