import type { StaffTicketDetail, TicketStatus } from "../api.js";

// Lab 4, Issue 4 — the gate notice (docs/lab-04/ui-spec.md §1.6; specification.md
// FR-08, BR-28, BR-30). Shown under the status select when Resolved would be a
// next step from this status but the resolution gate fails, listing only the
// conditions still unmet, with their counts. A polite live region, so a change
// that clears a condition is announced. The server still decides (BR-28).

// The statuses from which RESOLVED is a next step (the BR-27 matrix).
const RESOLVABLE_FROM: readonly TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

export function GateNotice({ status, gate }: { status: TicketStatus; gate: StaffTicketDetail["resolutionGate"] | undefined }) {
  if (!gate || gate.passes || !RESOLVABLE_FROM.includes(status)) return null;
  const unmet: string[] = [];
  if (gate.completedCount === 0) unmet.push(`at least one action is completed (${gate.completedCount} completed)`);
  if (gate.plannedCount > 0) unmet.push(`no action is still planned (${gate.plannedCount} planned)`);
  if (gate.openFollowUpCount > 0) unmet.push(`every follow-up is handled (${gate.openFollowUpCount} open)`);
  return (
    <div className="zg-gate-notice mt-2" role="status" aria-live="polite" aria-label="Why Resolved is unavailable">
      {/* No icon: the glyph is missing from some system fonts, and the text says it all. */}
      <p className="mb-1 fw-semibold">Resolved is available once:</p>
      <ul className="mb-0">
        {unmet.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
