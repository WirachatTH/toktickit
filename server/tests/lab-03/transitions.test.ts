import { describe, it, expect } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { isPermittedTransition, permittedTransitions, requiredText, requiresOwner, statusTextError } from "../../src/ticketWorkflow.js";

// UNIT-07 to UNIT-09 — the ticket workflow rules (docs/lab-03/specification.md
// BR-41, BR-42, BR-44, BR-45). The expected table is written out here from the
// spec, not imported, so the test cannot agree with a mistake in the code.

const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];

const BR_41: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
};

describe("UNIT-07 the transition table (BR-41)", () => {
  it("permits exactly the BR-41 pairs among all 64, never the same status, never from a terminal status", () => {
    let permitted = 0;
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = BR_41[from].includes(to);
        expect(isPermittedTransition(from, to), `${from} -> ${to}`).toBe(expected);
        if (expected) permitted++;
      }
      expect(isPermittedTransition(from, from), `${from} -> itself`).toBe(false);
      expect(permittedTransitions(from), from).toEqual(BR_41[from]);
    }
    expect(permitted).toBe(17);
    for (const terminal of ["CLOSED", "CANCELLED"] as const) expect(permittedTransitions(terminal)).toEqual([]);
  });

  it("does not let a status value outside the eight through", () => {
    expect(isPermittedTransition("OPEN", "PENDING" as TicketStatus)).toBe(false);
    expect(isPermittedTransition("PENDING" as TicketStatus, "OPEN")).toBe(false);
  });
});

describe("UNIT-08 which targets need an owner (BR-42)", () => {
  it("requires an owner for every target except CANCELLED", () => {
    for (const to of ALL) expect(requiresOwner(to), to).toBe(to !== "CANCELLED");
  });
});

describe("UNIT-09 the text each target requires (BR-44, BR-45)", () => {
  it("asks RESOLVED for a resolution summary and CANCELLED / REOPENED for a reason, nothing else", () => {
    expect(requiredText("RESOLVED")).toEqual({ field: "resolutionSummary", min: 10, max: 2000 });
    expect(requiredText("CANCELLED")).toEqual({ field: "reason", min: 10, max: 1000 });
    expect(requiredText("REOPENED")).toEqual({ field: "reason", min: 10, max: 1000 });
    for (const to of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "CLOSED"] as const) expect(requiredText(to), to).toBeNull();
  });

  it("accepts the boundaries after trimming and rejects one past them", () => {
    const ok = (to: TicketStatus, body: Record<string, unknown>) => expect(statusTextError(to, body), JSON.stringify(body).slice(0, 40)).toBeNull();
    const bad = (to: TicketStatus, body: Record<string, unknown>, field: string) => {
      const error = statusTextError(to, body);
      expect(error, JSON.stringify(body).slice(0, 40)).not.toBeNull();
      expect(Object.keys(error!)).toEqual([field]);
    };
    ok("RESOLVED", { resolutionSummary: "x".repeat(10) });
    ok("RESOLVED", { resolutionSummary: "x".repeat(2000) });
    ok("RESOLVED", { resolutionSummary: `  ${"x".repeat(2000)}  ` });
    bad("RESOLVED", { resolutionSummary: "x".repeat(9) }, "resolutionSummary");
    bad("RESOLVED", { resolutionSummary: `   ${"x".repeat(9)}   ` }, "resolutionSummary");
    bad("RESOLVED", { resolutionSummary: "x".repeat(2001) }, "resolutionSummary");
    bad("RESOLVED", {}, "resolutionSummary");
    bad("RESOLVED", { resolutionSummary: 12345678901 }, "resolutionSummary");
    for (const to of ["CANCELLED", "REOPENED"] as const) {
      ok(to, { reason: "y".repeat(10) });
      ok(to, { reason: "y".repeat(1000) });
      bad(to, { reason: "y".repeat(9) }, "reason");
      bad(to, { reason: "y".repeat(1001) }, "reason");
      bad(to, { reason: "          " }, "reason");
      bad(to, {}, "reason");
    }
    // Targets with no text ignore any text sent.
    ok("IN_PROGRESS", {});
    ok("CLOSED", { reason: "x" });
  });
});
