import { describe, it, expect } from "vitest";
import { resolutionGate } from "../../src/resolutionGate.js";

// UNIT-05 — the resolution gate over a ticket's actions
// (docs/lab-04/specification.md BR-14, BR-28, BR-29).

type A = { id: number; status: "PLANNED" | "COMPLETED" | "CANCELLED"; followUpRequired: boolean; followUpOfId: number | null };
const act = (id: number, status: A["status"], extra: Partial<A> = {}): A => ({ id, status, followUpRequired: false, followUpOfId: null, ...extra });

describe("UNIT-05 the resolution gate (BR-28)", () => {
  it("needs at least one completed action", () => {
    expect(resolutionGate([])).toEqual({ passes: false, completedCount: 0, plannedCount: 0, openFollowUpCount: 0 });
    expect(resolutionGate([act(1, "CANCELLED"), act(2, "CANCELLED")])).toEqual({ passes: false, completedCount: 0, plannedCount: 0, openFollowUpCount: 0 });
    expect(resolutionGate([act(1, "COMPLETED")])).toEqual({ passes: true, completedCount: 1, plannedCount: 0, openFollowUpCount: 0 });
  });

  it("refuses while any action is planned", () => {
    expect(resolutionGate([act(1, "COMPLETED"), act(2, "PLANNED"), act(3, "PLANNED")])).toEqual({ passes: false, completedCount: 1, plannedCount: 2, openFollowUpCount: 0 });
  });

  it("refuses while a completed action's follow-up is unhandled, and counts only completed follow-ups as handling it", () => {
    const needs = act(1, "COMPLETED", { followUpRequired: true });
    expect(resolutionGate([needs])).toMatchObject({ passes: false, openFollowUpCount: 1 });
    // A planned follow-up does not handle it (and blocks anyway).
    expect(resolutionGate([needs, act(2, "PLANNED", { followUpOfId: 1 })])).toMatchObject({ passes: false, plannedCount: 1, openFollowUpCount: 1 });
    // A cancelled follow-up does not handle it.
    expect(resolutionGate([needs, act(2, "CANCELLED", { followUpOfId: 1 })])).toMatchObject({ passes: false, openFollowUpCount: 1 });
    // A completed one does.
    expect(resolutionGate([needs, act(2, "COMPLETED", { followUpOfId: 1 })])).toEqual({ passes: true, completedCount: 2, plannedCount: 0, openFollowUpCount: 0 });
    // A planned or cancelled action that is flagged is not a completed action needing follow-up.
    expect(resolutionGate([act(1, "COMPLETED"), act(2, "CANCELLED", { followUpRequired: true })])).toMatchObject({ passes: true, openFollowUpCount: 0 });
  });

  it("counts each open follow-up once, however many actions link elsewhere", () => {
    const actions = [act(1, "COMPLETED", { followUpRequired: true }), act(2, "COMPLETED", { followUpRequired: true }), act(3, "COMPLETED", { followUpOfId: 2 })];
    expect(resolutionGate(actions)).toEqual({ passes: false, completedCount: 3, plannedCount: 0, openFollowUpCount: 1 });
  });
});
