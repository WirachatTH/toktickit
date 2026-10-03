import type { TicketStatus } from "@prisma/client";

// Lab 3, Issue 8 — the ticket workflow rules, with no database in sight
// (docs/lab-03/specification.md BR-41, BR-42, BR-44, BR-45).

// BR-41 — the complete table. Anything not listed, the current status itself
// included, is refused. A NEW ticket reaches OPEN only by getting an owner
// (BR-32), never through the status route.
const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  NEW: ["CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
};

export const TICKET_STATUSES = Object.keys(TRANSITIONS) as TicketStatus[];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as string[]).includes(value);
}

export function permittedTransitions(from: TicketStatus): TicketStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export function isPermittedTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// BR-47 — the statuses in which a Requester may say the problem appears
// resolved, once. It records their opinion; it never changes the status (BR-05).
const MARKABLE: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

export function canMarkAppearsResolved(status: TicketStatus, requesterResolvedAt: Date | null): boolean {
  return MARKABLE.includes(status) && requesterResolvedAt === null;
}

// BR-42 — only a cancellation may happen without an owner.
export function requiresOwner(to: TicketStatus): boolean {
  return to !== "CANCELLED";
}

export interface RequiredText {
  field: "resolutionSummary" | "reason";
  min: number;
  max: number;
}

// BR-44, BR-45 — the text a target needs. A resolution summary is stored on the
// ticket; a reason is posted as a Public Comment so the Requester learns why.
export function requiredText(to: TicketStatus): RequiredText | null {
  if (to === "RESOLVED") return { field: "resolutionSummary", min: 10, max: 2000 };
  if (to === "CANCELLED" || to === "REOPENED") return { field: "reason", min: 10, max: 1000 };
  return null;
}

/** The field error for the text `to` requires, or null when it is fine (lengths after trimming). */
export function statusTextError(to: TicketStatus, body: Record<string, unknown>): Record<string, string> | null {
  const rule = requiredText(to);
  if (!rule) return null;
  const raw = body[rule.field];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length >= rule.min && value.length <= rule.max) return null;
  const what = rule.field === "reason" ? "a reason" : "a resolution summary";
  return { [rule.field]: `Enter ${what} of ${rule.min} to ${rule.max} characters.` };
}
