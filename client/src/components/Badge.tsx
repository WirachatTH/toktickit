import type { Role, TicketStatus } from "../api.js";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "zg-badge--priority-low",
  MEDIUM: "zg-badge--priority-medium",
  HIGH: "zg-badge--priority-high",
};

// Lab 2 defined NEW only; the other seven status badges (ui-spec §1.2) arrive
// with the workflow in Issue 8 and use the visible fallback until then.
const STATUS_CLASS: Partial<Record<TicketStatus, string>> = {
  NEW: "zg-badge--status-new",
};

interface PriorityBadgeProps {
  kind: "priority";
  value: Priority;
}
interface StatusBadgeProps {
  kind: "status";
  value: TicketStatus;
}

// One shared component for Requested Priority and Current Status badges so
// the same value always renders with the same color/label everywhere it
// appears (Create Ticket success, My Tickets, Ticket Detail) — ui-spec.md §5.
//
// `value` is statically typed to the known set, but it will ultimately come
// from parsed API JSON (Issue 5+), which TypeScript cannot verify at
// runtime. Without a fallback, an unexpected value silently produces the
// literal class name "zg-badge undefined" instead of failing visibly.
export function Badge({ kind, value }: PriorityBadgeProps | StatusBadgeProps) {
  const modifier = (kind === "priority" ? PRIORITY_CLASS[value] : STATUS_CLASS[value]) ?? "zg-badge--unknown";
  return <span className={`zg-badge ${modifier}`}>{value}</span>;
}

// Lab 3, Issue 4 — role badges (docs/lab-03/ui-spec.md §1.4). Outlined pills
// (Administrator filled), so a role is never mistaken for a status or a
// priority, and always in words: colour is never the only signal.
const ROLE_BADGE: Record<Role, [string, string]> = {
  REQUESTER: ["zg-badge--role-requester", "Requester"],
  IT_STAFF: ["zg-badge--role-it-staff", "IT Staff"],
  ADMINISTRATOR: ["zg-badge--role-administrator", "Administrator"],
};

export function RoleBadge({ role }: { role: Role }) {
  const [modifier, label] = ROLE_BADGE[role] ?? ["zg-badge--unknown", String(role)];
  return <span className={`zg-badge ${modifier}`}>{label}</span>;
}
