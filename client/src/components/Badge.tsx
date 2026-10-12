import type { ActionTakenStatus, Role, TicketStatus } from "../api.js";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "zg-badge--priority-low",
  MEDIUM: "zg-badge--priority-medium",
  HIGH: "zg-badge--priority-high",
};

// Lab 3, Issue 8 — all eight statuses (docs/lab-03/ui-spec.md §1.2). NEW keeps
// its Lab 2 class and label exactly.
const STATUS_CLASS: Record<TicketStatus, string> = {
  NEW: "zg-badge--status-new",
  OPEN: "zg-badge--status-open",
  IN_PROGRESS: "zg-badge--status-in-progress",
  WAITING_FOR_REQUESTER: "zg-badge--status-waiting-for-requester",
  RESOLVED: "zg-badge--status-resolved",
  CLOSED: "zg-badge--status-closed",
  REOPENED: "zg-badge--status-reopened",
  CANCELLED: "zg-badge--status-cancelled",
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
  // Status labels read with spaces ("IN PROGRESS"); NEW reads exactly as in Lab 2.
  const label = kind === "status" ? String(value).replace(/_/g, " ") : value;
  return <span className={`zg-badge ${modifier}`}>{label}</span>;
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

// Lab 4, Issue 3 — action status badges and follow-up pills (docs/lab-04/ui-spec.md
// §1.1, §1.2). An action's words never repeat a ticket status's, and every
// state carries its text and an icon, so colour is never the only signal.
const ACTION_BADGE: Record<ActionTakenStatus, [string, string, string]> = {
  PLANNED: ["zg-badge--action-planned", "Planned", "◷"],
  COMPLETED: ["zg-badge--action-completed", "Completed", "✓"],
  CANCELLED: ["zg-badge--action-cancelled", "Cancelled", "✕"],
};

export function ActionStatusBadge({ status }: { status: ActionTakenStatus }) {
  const [modifier, label, icon] = ACTION_BADGE[status] ?? ["zg-badge--unknown", String(status), ""];
  return (
    <span className="zg-badge-group">
      <span aria-hidden="true" className="zg-badge-icon">{icon}</span>
      <span className={`zg-badge ${modifier}`}>{label}</span>
    </span>
  );
}

export function FollowUpPill({ handled }: { handled: boolean }) {
  return handled ? (
    <span className="zg-pill zg-pill--followup-handled">Follow-up handled</span>
  ) : (
    <span className="zg-pill zg-pill--followup-needed">Follow-up needed</span>
  );
}
