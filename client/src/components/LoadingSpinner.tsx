export interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Loading…" }: LoadingSpinnerProps) {
  return (
    <div className="zg-loading" role="status">
      <span className="zg-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
