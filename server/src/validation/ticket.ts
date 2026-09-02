// Server-side ticket field validation — the source of truth (BR-23). The
// client mirrors these limits for immediate feedback, but this is what
// actually decides whether a Ticket gets created.

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH";
const ALLOWED_PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH"];

export interface ValidTicketFields {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
}

export type TicketFieldErrors = Partial<Record<keyof ValidTicketFields, string>>;

export function validateTicketFields(
  body: Record<string, unknown>
): { fields: ValidTicketFields; errors?: undefined } | { fields?: undefined; errors: TicketFieldErrors } {
  const errors: TicketFieldErrors = {};

  const categoryId = Number(body.categoryId);
  if (!body.categoryId || !Number.isFinite(categoryId)) {
    errors.categoryId = "Category is required.";
  }

  const relatedSystemId = Number(body.relatedSystemId);
  if (!body.relatedSystemId || !Number.isFinite(relatedSystemId)) {
    errors.relatedSystemId = "Related System is required.";
  }

  // Trimmed before measuring (BR-20/21) — whitespace-only input must not
  // count as satisfying the minimum length.
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length < 5 || summary.length > 120) {
    errors.summary = "Summary must be between 5 and 120 characters.";
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < 20 || description.length > 2000) {
    errors.description = "Description must be between 20 and 2000 characters.";
  }

  let requestedPriority: RequestedPriority = "MEDIUM";
  if (body.requestedPriority !== undefined && body.requestedPriority !== "") {
    const candidate = String(body.requestedPriority);
    if (!ALLOWED_PRIORITIES.includes(candidate as RequestedPriority)) {
      errors.requestedPriority = "Requested Priority must be LOW, MEDIUM, or HIGH.";
    } else {
      requestedPriority = candidate as RequestedPriority;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { fields: { categoryId, relatedSystemId, summary, description, requestedPriority } };
}
