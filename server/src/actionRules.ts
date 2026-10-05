import type { ActionTakenStatus } from "@prisma/client";
import { isValidId } from "./authorization.js";

// Lab 4, Issue 2 — the Action Taken rules that need no database
// (docs/lab-04/specification.md BR-04, BR-06, BR-07, BR-10, BR-13; api-spec §1.3
// to §1.5). Each parser reads only the fields its request may set; everything
// the server owns (creator, performer, version, times, ticket) is never read.

export const ACTION_LIMITS = { description: 2000, result: 2000, followUpNote: 1000, attachmentNotes: 1000, reasonMin: 10, reasonMax: 1000 } as const;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const COMPLETED_GRACE = 5 * MINUTE; // client clock drift (BR-07)
const PLANNED_HORIZON = 365 * DAY;

type Fields = Record<string, string>;
export type Parsed<T> = { value: T } | { fields: Fields };

export interface CreateInput {
  status: "PLANNED" | "COMPLETED";
  actionAt: Date;
  description: string;
  assigneeId: number;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  followUpOfId: number | null;
  clientRequestId: string | null;
}

export interface EditChanges {
  actionAt?: Date;
  description?: string;
  assigneeId?: number;
  result?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

export type StatusInput =
  | { status: "COMPLETED"; expectedVersion: number; result?: string; followUpRequired?: boolean; followUpNote?: string | null; actionAt?: Date }
  | { status: "CANCELLED"; expectedVersion: number; reason: string };

// BR-10 — the only transitions; COMPLETED and CANCELLED are final.
const TRANSITIONS: Record<ActionTakenStatus, readonly ActionTakenStatus[]> = {
  PLANNED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionAction(from: ActionTakenStatus, to: ActionTakenStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// BR-13 — only a planned action can be edited.
export function isActionEditable(status: ActionTakenStatus): boolean {
  return status === "PLANNED";
}

// BR-07 — an ISO 8601 timestamp that names its offset, so the server never
// guesses a time zone (api-spec §0.3).
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseActionAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !ISO_WITH_OFFSET.test(raw)) return null;
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return date;
}

// BR-07 — the window, against the server's clock and the ticket's creation.
export function actionAtError(at: Date, status: "PLANNED" | "COMPLETED", opts: { now: Date; ticketCreatedAt: Date }): string | null {
  if (at.getTime() < opts.ticketCreatedAt.getTime()) return "The action can't be dated before the ticket was created.";
  if (status === "COMPLETED" && at.getTime() > opts.now.getTime() + COMPLETED_GRACE) return "Completed work can't be dated in the future.";
  if (status === "PLANNED" && at.getTime() > opts.now.getTime() + PLANNED_HORIZON) return "Plan the action within the next 365 days.";
  return null;
}

// A trimmed text within its limit; `required` makes blank an error, otherwise
// blank becomes null.
function text(raw: unknown, max: number, required: boolean, label: string): { ok: string | null } | { error: string } {
  if (raw === undefined || raw === null) return required ? { error: `Enter ${label}.` } : { ok: null };
  if (typeof raw !== "string") return { error: `Enter ${label} as text.` };
  const value = raw.trim();
  if (value === "") return required ? { error: `Enter ${label}.` } : { ok: null };
  if (value.length > max) return { error: `Keep ${label} to ${max} characters or fewer.` };
  return { ok: value };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function positiveVersion(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
}

// api-spec §1.3 — the create body. Database-dependent checks (assignee,
// followUpOfId, actionAt against the ticket) happen later, under the lock.
export function parseCreateBody(raw: unknown): Parsed<CreateInput> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields: Fields = {};

  const status = body.status;
  if (status !== "PLANNED" && status !== "COMPLETED") fields.status = "Choose Planned or Completed.";

  const actionAt = parseActionAt(body.actionAt);
  if (!actionAt) fields.actionAt = "Enter the date and time with its time zone.";

  const description = text(body.description, ACTION_LIMITS.description, true, "a description");
  if ("error" in description) fields.description = description.error;

  const assigneeId = typeof body.assigneeId === "number" && isValidId(body.assigneeId) ? body.assigneeId : null;
  if (assigneeId === null) fields.assigneeId = "Choose who the action is assigned to.";

  const result = text(body.result, ACTION_LIMITS.result, status === "COMPLETED", "the result");
  if ("error" in result) fields.result = result.error;

  let followUpRequired = false;
  if (body.followUpRequired !== undefined) {
    if (typeof body.followUpRequired === "boolean") followUpRequired = body.followUpRequired;
    else fields.followUpRequired = "Answer yes or no.";
  }
  // BR-04 — required with the flag, discarded without it.
  const note = followUpRequired ? text(body.followUpNote, ACTION_LIMITS.followUpNote, true, "a follow-up note") : { ok: null };
  if ("error" in note) fields.followUpNote = note.error;

  const attachmentNotes = text(body.attachmentNotes, ACTION_LIMITS.attachmentNotes, false, "attachment notes");
  if ("error" in attachmentNotes) fields.attachmentNotes = attachmentNotes.error;

  let followUpOfId: number | null = null;
  if (body.followUpOfId !== undefined && body.followUpOfId !== null) {
    if (typeof body.followUpOfId === "number" && isValidId(body.followUpOfId)) followUpOfId = body.followUpOfId;
    else fields.followUpOfId = "Choose an earlier action of this ticket.";
  }

  let clientRequestId: string | null = null;
  if (body.clientRequestId !== undefined && body.clientRequestId !== null) {
    if (typeof body.clientRequestId === "string" && UUID.test(body.clientRequestId)) clientRequestId = body.clientRequestId.toLowerCase();
    else fields.clientRequestId = "Send a UUID.";
  }

  if (Object.keys(fields).length > 0) return { fields };
  return {
    value: {
      status: status as CreateInput["status"],
      actionAt: actionAt!,
      description: (description as { ok: string }).ok,
      assigneeId: assigneeId!,
      result: (result as { ok: string | null }).ok,
      followUpRequired,
      followUpNote: (note as { ok: string | null }).ok,
      attachmentNotes: (attachmentNotes as { ok: string | null }).ok,
      followUpOfId,
      clientRequestId,
    },
  };
}

// api-spec §1.4 — expectedVersion plus any editable field that was sent.
export function parseEditBody(raw: unknown): Parsed<{ expectedVersion: number; changes: EditChanges }> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields: Fields = {};
  const changes: EditChanges = {};

  const expectedVersion = positiveVersion(body.expectedVersion);
  if (expectedVersion === null) fields.expectedVersion = "Send the version the screen shows.";

  if ("actionAt" in body) {
    const at = parseActionAt(body.actionAt);
    if (at) changes.actionAt = at;
    else fields.actionAt = "Enter the date and time with its time zone.";
  }
  if ("description" in body) {
    const v = text(body.description, ACTION_LIMITS.description, true, "a description");
    if ("error" in v) fields.description = v.error;
    else changes.description = v.ok!;
  }
  if ("assigneeId" in body) {
    if (typeof body.assigneeId === "number" && isValidId(body.assigneeId)) changes.assigneeId = body.assigneeId;
    else fields.assigneeId = "Choose who the action is assigned to.";
  }
  if ("result" in body) {
    const v = text(body.result, ACTION_LIMITS.result, false, "the result");
    if ("error" in v) fields.result = v.error;
    else changes.result = v.ok;
  }
  if ("followUpRequired" in body) {
    if (typeof body.followUpRequired === "boolean") changes.followUpRequired = body.followUpRequired;
    else fields.followUpRequired = "Answer yes or no.";
  }
  if ("followUpNote" in body) {
    const v = text(body.followUpNote, ACTION_LIMITS.followUpNote, false, "a follow-up note");
    if ("error" in v) fields.followUpNote = v.error;
    else changes.followUpNote = v.ok;
  }
  if ("attachmentNotes" in body) {
    const v = text(body.attachmentNotes, ACTION_LIMITS.attachmentNotes, false, "attachment notes");
    if ("error" in v) fields.attachmentNotes = v.error;
    else changes.attachmentNotes = v.ok;
  }

  if (Object.keys(fields).length > 0) return { fields };
  return { value: { expectedVersion: expectedVersion!, changes } };
}

// api-spec §1.5 — complete (result, optional final follow-up and date) or cancel (reason).
export function parseStatusBody(raw: unknown): Parsed<StatusInput> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields: Fields = {};
  const expectedVersion = positiveVersion(body.expectedVersion);
  if (expectedVersion === null) fields.expectedVersion = "Send the version the screen shows.";

  if (body.status === "CANCELLED") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < ACTION_LIMITS.reasonMin || reason.length > ACTION_LIMITS.reasonMax) {
      fields.reason = `Give a reason of ${ACTION_LIMITS.reasonMin} to ${ACTION_LIMITS.reasonMax} characters.`;
    }
    if (Object.keys(fields).length > 0) return { fields };
    return { value: { status: "CANCELLED", expectedVersion: expectedVersion!, reason } };
  }

  if (body.status !== "COMPLETED") {
    fields.status = "Choose Completed or Cancelled.";
    return { fields };
  }
  const value: Extract<StatusInput, { status: "COMPLETED" }> = { status: "COMPLETED", expectedVersion: expectedVersion ?? 0 };
  if ("result" in body && body.result !== null && body.result !== undefined) {
    const v = text(body.result, ACTION_LIMITS.result, true, "the result");
    if ("error" in v) fields.result = v.error;
    else value.result = v.ok!;
  }
  if ("followUpRequired" in body) {
    if (typeof body.followUpRequired === "boolean") value.followUpRequired = body.followUpRequired;
    else fields.followUpRequired = "Answer yes or no.";
  }
  if ("followUpNote" in body) {
    const v = text(body.followUpNote, ACTION_LIMITS.followUpNote, false, "a follow-up note");
    if ("error" in v) fields.followUpNote = v.error;
    else value.followUpNote = v.ok;
  }
  if ("actionAt" in body) {
    const at = parseActionAt(body.actionAt);
    if (at) value.actionAt = at;
    else fields.actionAt = "Enter the date and time with its time zone.";
  }
  if (Object.keys(fields).length > 0) return { fields };
  return { value };
}

// BR-04 — an edit's follow-up fields combined with what is stored.
export function resolveFollowUp(
  stored: { followUpRequired: boolean; followUpNote: string | null },
  change: { followUpRequired?: boolean; followUpNote?: string | null },
): { followUpRequired: boolean; followUpNote: string | null } | { error: string } {
  const required = change.followUpRequired ?? stored.followUpRequired;
  if (!required) return { followUpRequired: false, followUpNote: null };
  const note = change.followUpNote !== undefined ? change.followUpNote : stored.followUpNote;
  if (!note) return { error: "Enter a follow-up note." };
  return { followUpRequired: true, followUpNote: note };
}
