import type { TicketStatus } from "@prisma/client";

// Lab 4, Issue 5 — the status groups and the drill-down filters added to Lab 2–3
// list endpoints (docs/lab-04/specification.md BR-35, BR-45 (4), D-13; api-spec
// §4). Each is optional and read leniently: an unknown value means "no filter",
// so without it every endpoint behaves exactly as before (Lab 2 D-5).

// BR-35 — work still to be done. "Active" (the Lab 3 queue's default) is this plus RESOLVED.
export const UNRESOLVED_STATUSES: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
export const TICKET_STATUSES: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
export const ACTIVE_STATUSES: readonly TicketStatus[] = [...UNRESOLVED_STATUSES, "RESOLVED"];

export type RequesterStatusFilter = "ALL" | "UNRESOLVED" | TicketStatus;

// api-spec §4.1 — My Tickets' `status`.
export function parseRequesterStatus(raw: unknown): RequesterStatusFilter {
  if (raw === "UNRESOLVED") return "UNRESOLVED";
  if (typeof raw === "string" && (TICKET_STATUSES as readonly string[]).includes(raw)) return raw as TicketStatus;
  return "ALL";
}

/** The Prisma condition for a status filter; `undefined` means none. */
export function statusCondition(filter: RequesterStatusFilter): { currentStatus: TicketStatus | { in: TicketStatus[] } } | undefined {
  if (filter === "ALL") return undefined;
  if (filter === "UNRESOLVED") return { currentStatus: { in: [...UNRESOLVED_STATUSES] } };
  return { currentStatus: filter };
}

// api-spec §4.3 — the user list's `status`.
export function parseUserStatus(raw: unknown): "active" | "inactive" | null {
  return raw === "active" || raw === "inactive" ? raw : null;
}
