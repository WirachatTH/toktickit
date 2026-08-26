export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type TicketStatus = "NEW";

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "zg-badge--priority-low",
  MEDIUM: "zg-badge--priority-medium",
  HIGH: "zg-badge--priority-high",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
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
