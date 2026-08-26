// Shared class-name builder for the Zen Green field controls
// (TextInput/TextArea/Select) so the editable/read-only/invalid states in
// docs/lab-02/ui-spec.md §3 are applied identically everywhere.
export function fieldClassName(opts: {
  readOnly?: boolean;
  invalid?: boolean;
  className?: string;
}): string {
  return [
    "zg-field",
    opts.readOnly && "zg-field--readonly",
    opts.invalid && "is-invalid",
    opts.className,
  ]
    .filter(Boolean)
    .join(" ");
}
