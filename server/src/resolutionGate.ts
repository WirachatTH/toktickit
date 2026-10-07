import type { ActionTakenStatus } from "@prisma/client";

// Lab 4, Issue 4 — the resolution gate (docs/lab-04/specification.md BR-14,
// BR-28, BR-29). A ticket may become RESOLVED only when its recorded work
// supports it:
//   (a) at least one COMPLETED action;
//   (b) no PLANNED action;
//   (c) no unhandled follow-up: every COMPLETED action marked Follow-Up Required
//       has at least one COMPLETED action linked to it through followUpOfId.
// Cancelled actions count for nothing (BR-12). This is a pure function of the
// ticket's actions; the status route calls it under the ticket-row lock
// (BR-26), so the actions it sees cannot change before the status does.

export interface GateAction {
  id: number;
  status: ActionTakenStatus;
  followUpRequired: boolean;
  followUpOfId: number | null;
}

export interface ResolutionGate {
  passes: boolean;
  completedCount: number;
  plannedCount: number;
  openFollowUpCount: number;
}

export function resolutionGate(actions: readonly GateAction[]): ResolutionGate {
  const completed = actions.filter((a) => a.status === "COMPLETED");
  const handled = new Set(completed.map((a) => a.followUpOfId).filter((id): id is number => id !== null));
  const completedCount = completed.length;
  const plannedCount = actions.filter((a) => a.status === "PLANNED").length;
  const openFollowUpCount = completed.filter((a) => a.followUpRequired && !handled.has(a.id)).length;
  return { passes: completedCount > 0 && plannedCount === 0 && openFollowUpCount === 0, completedCount, plannedCount, openFollowUpCount };
}

// The 409's message, naming what is still outstanding (api-spec §0.2).
export function gateMessage(gate: ResolutionGate): string {
  const reasons: string[] = [];
  if (gate.completedCount === 0) reasons.push("no action has been completed yet");
  if (gate.plannedCount > 0) reasons.push(`${gate.plannedCount} planned ${gate.plannedCount === 1 ? "action is" : "actions are"} still open`);
  if (gate.openFollowUpCount > 0) reasons.push(`${gate.openFollowUpCount} ${gate.openFollowUpCount === 1 ? "follow-up is" : "follow-ups are"} not handled`);
  return `This ticket can't be resolved yet: ${reasons.join("; ")}.`;
}
