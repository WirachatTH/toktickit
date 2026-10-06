import * as api from "../../src/api.js";

// The Lab 4 request functions, one sample call each. Shared by REG-05
// (apiCredentials.lab4.test.ts) and by Lab 3's coverage check, which compares
// the full list of exported calls (docs/lab-04/specification.md BR-46).
export const LAB4_CALLS: [string, () => Promise<unknown>][] = [
  ["fetchActionsTaken", () => api.fetchActionsTaken(42)],
  ["createActionTaken", () => api.createActionTaken(42, { status: "PLANNED", actionAt: "2026-10-06T09:00:00+07:00", description: "d", assigneeId: 8 })],
  ["updateActionTaken", () => api.updateActionTaken(42, 7, { expectedVersion: 1, description: "d" })],
  ["changeActionStatus", () => api.changeActionStatus(42, 7, { status: "CANCELLED", expectedVersion: 1, reason: "No longer needed." })],
  ["fetchActionHistory", () => api.fetchActionHistory(42, 7)],
];
