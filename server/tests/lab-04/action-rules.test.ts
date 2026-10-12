import { describe, it, expect } from "vitest";
import {
  ACTION_LIMITS,
  actionAtError,
  canTransitionAction,
  isActionEditable,
  parseActionAt,
  parseCreateBody,
  parseEditBody,
  parseStatusBody,
  resolveFollowUp,
} from "../../src/actionRules.js";

// UNIT-01 to UNIT-04 — the Action Taken rules that need no database
// (docs/lab-04/specification.md BR-04, BR-06, BR-07, BR-10, BR-13).

const NOW = new Date("2026-10-05T09:00:00.000Z");
const CREATED = new Date("2026-10-01T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const valid = {
  status: "PLANNED",
  actionAt: "2026-10-06T09:00:00+07:00",
  description: "Replace the laptop battery.",
  assigneeId: 7,
};

function fieldsOf(result: ReturnType<typeof parseCreateBody>) {
  return "fields" in result ? result.fields : {};
}

describe("UNIT-01 text rules (BR-06)", () => {
  it("accepts every text at its bounds after trimming and rejects one past", () => {
    expect(ACTION_LIMITS).toEqual({ description: 2000, result: 2000, followUpNote: 1000, attachmentNotes: 1000, reasonMin: 10, reasonMax: 1000 });

    const ok = parseCreateBody({
      ...valid,
      description: ` ${"d".repeat(2000)} `,
      result: "r".repeat(2000),
      followUpRequired: true,
      followUpNote: "n".repeat(1000),
      attachmentNotes: "a".repeat(1000),
    });
    expect("value" in ok && ok.value.description.length).toBe(2000);
    expect(fieldsOf(parseCreateBody({ ...valid, description: "x" }))).toEqual({});

    const tooLong = parseCreateBody({
      ...valid,
      description: "d".repeat(2001),
      result: "r".repeat(2001),
      followUpRequired: true,
      followUpNote: "n".repeat(1001),
      attachmentNotes: "a".repeat(1001),
    });
    expect(Object.keys(fieldsOf(tooLong)).sort()).toEqual(["attachmentNotes", "description", "followUpNote", "result"]);
  });

  it("treats empty and whitespace-only text as missing", () => {
    for (const blank of ["", "   ", "\n\t "]) {
      expect(fieldsOf(parseCreateBody({ ...valid, description: blank })).description, JSON.stringify(blank)).toBeTruthy();
      expect(fieldsOf(parseCreateBody({ ...valid, status: "COMPLETED", actionAt: "2026-10-05T08:00:00Z", result: blank })).result).toBeTruthy();
    }
    // Attachment notes are optional: blank is stored as no value.
    const blankNotes = parseCreateBody({ ...valid, attachmentNotes: "   " });
    expect("value" in blankNotes && blankNotes.value.attachmentNotes).toBeNull();
    // A result on a planned action is optional, but trimmed when given.
    const planned = parseCreateBody({ ...valid, result: "  partial  " });
    expect("value" in planned && planned.value.result).toBe("partial");
  });

  it("checks the cancellation reason at 9, 10, 1000, and 1001 characters", () => {
    const reasonError = (n: number) => {
      const res = parseStatusBody({ status: "CANCELLED", expectedVersion: 1, reason: "r".repeat(n) });
      return "fields" in res ? res.fields.reason : null;
    };
    expect(reasonError(9)).toBeTruthy();
    expect(reasonError(10)).toBeNull();
    expect(reasonError(1000)).toBeNull();
    expect(reasonError(1001)).toBeTruthy();
    expect("fields" in parseStatusBody({ status: "CANCELLED", expectedVersion: 1, reason: `   ${"r".repeat(9)}   ` })).toBe(true);
  });

  it("rejects non-string text and unknown statuses", () => {
    const f = fieldsOf(parseCreateBody({ ...valid, description: 42, status: "DONE", assigneeId: "7" }));
    expect(Object.keys(f).sort()).toEqual(["assigneeId", "description", "status"]);
    expect(Object.keys(fieldsOf(parseCreateBody({}))).sort()).toEqual(["actionAt", "assigneeId", "description", "status"]);
  });
});

describe("UNIT-02 the Action Date/Time window (BR-07)", () => {
  it("requires an ISO timestamp with an offset", () => {
    expect(parseActionAt("2026-10-05T09:00:00Z")).toEqual(new Date("2026-10-05T09:00:00Z"));
    expect(parseActionAt("2026-10-05T16:00:00+07:00")).toEqual(new Date("2026-10-05T09:00:00Z"));
    expect(parseActionAt("2028-02-29T09:00:00Z")).toEqual(new Date("2028-02-29T09:00:00Z")); // a leap day exists
    for (const bad of ["2026-10-05T09:00:00", "2026-10-05", "yesterday", "2026-13-05T09:00:00Z", "2026-02-31T09:00:00Z", "2026-04-31T09:00:00+07:00", "2026-10-00T09:00:00Z", 1728118800000, null, undefined]) {
      expect(parseActionAt(bad), String(bad)).toBeNull();
    }
    expect(fieldsOf(parseCreateBody({ ...valid, actionAt: "2026-10-06T09:00:00" })).actionAt).toBeTruthy();
  });

  it("says a well-formed but impossible date doesn't exist, rather than asking for a time zone (PR #75 follow-up)", () => {
    const MISSING = "That date doesn't exist.";
    const FORMAT = "Enter the date and time with its time zone.";
    for (const impossible of ["2026-11-31T09:00:00Z", "2026-02-29T09:00:00+07:00", "2026-13-01T09:00:00Z", "2026-10-00T09:00:00Z"]) {
      expect(fieldsOf(parseCreateBody({ ...valid, actionAt: impossible })).actionAt, impossible).toBe(MISSING);
      const edit = parseEditBody({ expectedVersion: 1, actionAt: impossible });
      expect("fields" in edit && edit.fields.actionAt, impossible).toBe(MISSING);
      const done = parseStatusBody({ status: "COMPLETED", expectedVersion: 1, actionAt: impossible });
      expect("fields" in done && done.fields.actionAt, impossible).toBe(MISSING);
    }
    // The date exists; only the time or the offset is wrong (PR #77 review).
    for (const malformed of ["2026-10-06T09:00:00", "yesterday", 42, "2026-10-05T25:61:00Z", "2026-10-05T10:00:00+99:99"]) {
      expect(fieldsOf(parseCreateBody({ ...valid, actionAt: malformed })).actionAt, String(malformed)).toBe(FORMAT);
    }
  });

  it("never allows a time before the ticket was created", () => {
    const opts = { now: NOW, ticketCreatedAt: CREATED };
    expect(actionAtError(new Date(CREATED.getTime() - 1), "PLANNED", opts)).toBeTruthy();
    expect(actionAtError(new Date(CREATED.getTime() - 1), "COMPLETED", opts)).toBeTruthy();
    expect(actionAtError(CREATED, "COMPLETED", opts)).toBeNull();
  });

  // Issue 8 (found by E2E-01): the form's date has minute precision, so an action
  // added in the minute the ticket was created is dated at that minute's start.
  it("compares with the ticket's creation to the minute", () => {
    const created = new Date("2026-10-05T03:00:30.500Z");
    const opts = { now: new Date("2026-10-05T03:00:50.000Z"), ticketCreatedAt: created };
    expect(actionAtError(new Date("2026-10-05T03:00:00.000Z"), "PLANNED", opts)).toBeNull();
    expect(actionAtError(new Date("2026-10-05T03:00:00.000Z"), "COMPLETED", opts)).toBeNull();
    expect(actionAtError(new Date("2026-10-05T02:59:59.999Z"), "PLANNED", opts)).toBeTruthy();
    expect(actionAtError(new Date("2026-10-05T02:59:59.999Z"), "COMPLETED", opts)).toBeTruthy();
  });

  it("lets a planned action be up to 365 days ahead, and a completed one at most 5 minutes ahead", () => {
    const opts = { now: NOW, ticketCreatedAt: CREATED };
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    expect(actionAtError(at(365 * DAY), "PLANNED", opts)).toBeNull();
    expect(actionAtError(at(365 * DAY + 1000), "PLANNED", opts)).toBeTruthy();
    expect(actionAtError(at(5 * MINUTE), "COMPLETED", opts)).toBeNull();
    expect(actionAtError(at(5 * MINUTE + 1000), "COMPLETED", opts)).toBeTruthy();
    expect(actionAtError(at(-30 * DAY), "PLANNED", { now: NOW, ticketCreatedAt: new Date(NOW.getTime() - 60 * DAY) })).toBeNull();
  });
});

describe("UNIT-03 follow-up normalisation (BR-04)", () => {
  it("requires a note with the flag, and drops a note sent without it", () => {
    expect(fieldsOf(parseCreateBody({ ...valid, followUpRequired: true })).followUpNote).toBeTruthy();
    expect(fieldsOf(parseCreateBody({ ...valid, followUpRequired: true, followUpNote: "  " })).followUpNote).toBeTruthy();
    const dropped = parseCreateBody({ ...valid, followUpRequired: false, followUpNote: "Not needed" });
    expect("value" in dropped && dropped.value.followUpNote).toBeNull();
    const absent = parseCreateBody(valid);
    expect("value" in absent && [absent.value.followUpRequired, absent.value.followUpNote]).toEqual([false, null]);
    expect(fieldsOf(parseCreateBody({ ...valid, followUpRequired: "yes" })).followUpRequired).toBeTruthy();
  });

  it("combines an edit with the stored values", () => {
    const stored = { followUpRequired: true, followUpNote: "Check next week" };
    // Turning the flag off clears the stored note.
    expect(resolveFollowUp(stored, { followUpRequired: false })).toEqual({ followUpRequired: false, followUpNote: null });
    // Turning it on needs a note, sent or already stored.
    expect(resolveFollowUp({ followUpRequired: false, followUpNote: null }, { followUpRequired: true })).toEqual({ error: expect.any(String) });
    expect(resolveFollowUp({ followUpRequired: false, followUpNote: null }, { followUpRequired: true, followUpNote: "Call back" })).toEqual({
      followUpRequired: true,
      followUpNote: "Call back",
    });
    // A note alone keeps the flag and replaces the note; with the flag off it is dropped.
    expect(resolveFollowUp(stored, { followUpNote: "New note" })).toEqual({ followUpRequired: true, followUpNote: "New note" });
    expect(resolveFollowUp({ followUpRequired: false, followUpNote: null }, { followUpNote: "Ignored" })).toEqual({ followUpRequired: false, followUpNote: null });
    expect(resolveFollowUp(stored, {})).toEqual(stored);
  });

  it("reads an edit body: expectedVersion is required, and fixed fields are ignored", () => {
    const missing = parseEditBody({ description: "x" });
    expect("fields" in missing && missing.fields.expectedVersion).toBeTruthy();
    for (const bad of [0, -1, 1.5, "2", null]) {
      expect("fields" in parseEditBody({ expectedVersion: bad }), String(bad)).toBe(true);
    }
    const edit = parseEditBody({ expectedVersion: 3, description: " New ", status: "COMPLETED", ticketId: 9, createdById: 1, version: 99, followUpOfId: 4 });
    expect(edit).toEqual({ value: { expectedVersion: 3, changes: { description: "New" } } });
  });
});

describe("UNIT-04 action status transitions (BR-10, BR-13)", () => {
  const STATUSES = ["PLANNED", "COMPLETED", "CANCELLED"] as const;
  it("permits exactly PLANNED → COMPLETED and PLANNED → CANCELLED", () => {
    const permitted = STATUSES.flatMap((from) => STATUSES.filter((to) => canTransitionAction(from, to)).map((to) => `${from}->${to}`));
    expect(permitted).toEqual(["PLANNED->COMPLETED", "PLANNED->CANCELLED"]);
  });

  it("allows editing only while planned", () => {
    expect(STATUSES.filter(isActionEditable)).toEqual(["PLANNED"]);
  });

  it("reads a status body for each target", () => {
    expect(parseStatusBody({ status: "COMPLETED", expectedVersion: 2, result: " Done " })).toEqual({
      value: { status: "COMPLETED", expectedVersion: 2, result: "Done" },
    });
    // The result may be omitted here; the handler then requires a stored one.
    expect("value" in parseStatusBody({ status: "COMPLETED", expectedVersion: 2 })).toBe(true);
    for (const status of ["PLANNED", "DONE", undefined]) {
      const res = parseStatusBody({ status, expectedVersion: 2 });
      expect("fields" in res && res.fields.status, String(status)).toBeTruthy();
    }
    const both = parseStatusBody({ status: "CANCELLED" });
    expect("fields" in both && Object.keys(both.fields).sort()).toEqual(["expectedVersion", "reason"]);
  });
});
