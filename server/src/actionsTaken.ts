import type { Express, NextFunction, Request, Response } from "express";
import { Prisma, type ActionTaken, type TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { findAccessibleTicket, isValidId, sessionUser } from "./authorization.js";
import { isClosedStatus } from "./ticketStatus.js";
import { actionAtError, isActionEditable, parseCreateBody, parseEditBody, parseStatusBody, resolveFollowUp } from "./actionRules.js";

// Lab 4, Issue 2 — Actions Taken (docs/lab-04/api-spec.md §1; specification.md
// BR-01 to BR-26, BR-43).
//
// Who may call each route is settled before these handlers run (route policies
// in authorization.ts: listing for every role on a ticket it may open; every
// write and the history for IT Staff and Administrators). What is left is the
// guard order's tail, the same in every handler:
//   ticket exists, and the action is on it (404) → body valid (400) → lock the
//   ticket row, then the assignee's row (BR-26, Lab 3 BR-81) → checks against
//   what is locked (400 for database-dependent fields, then 409) → write the
//   change and its history event in one transaction (BR-22).
// Because every write locks the ticket first, two changes to one ticket's
// actions — or an action change and a status change — run one after the other.

const PERSON = { select: { id: true, name: true, role: true, isActive: true } } as const;
const ACTION_INCLUDE = {
  assignee: PERSON,
  createdBy: PERSON,
  performedBy: PERSON,
  cancelledBy: PERSON,
  // BR-14 — a follow-up is handled once a completed action links to it.
  followUps: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 },
} satisfies Prisma.ActionTakenInclude;
type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof ACTION_INCLUDE }>;
const ORDER: Prisma.ActionTakenOrderByWithRelationInput[] = [{ actionAt: "asc" }, { id: "asc" }]; // BR-24

class Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}
const invalid = (fields: Record<string, string>) => new Refusal(400, "VALIDATION_ERROR", "Some fields need attention.", fields);
const ticketNotFound = () => new Refusal(404, "NOT_FOUND", "Ticket not found.");
const actionNotFound = () => new Refusal(404, "NOT_FOUND", "Action not found.");
const stale = () => new Refusal(409, "STALE_STATE", "This action was changed by someone else. Reload it and try again.");
const notPlanned = () => new Refusal(409, "ACTION_NOT_PLANNED", "This action is already completed or cancelled, so it can't be changed.");

// BR-20 — actions change only while the ticket is being worked.
function refuseForTicket(status: TicketStatus) {
  if (isClosedStatus(status)) throw new Refusal(409, "TICKET_CLOSED", "This ticket is closed, so its actions can't be changed.");
  if (status === "RESOLVED") throw new Refusal(409, "TICKET_RESOLVED", "This ticket is resolved. Reopen it to add or change actions.");
}

export function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionAt: a.actionAt,
    description: a.description,
    result: a.result,
    status: a.status,
    assignee: a.assignee,
    createdBy: a.createdBy,
    performedBy: a.performedBy,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    followUpHandled: a.followUpRequired ? a.followUps.length > 0 : null,
    followUpOfId: a.followUpOfId,
    attachmentNotes: a.attachmentNotes,
    cancelReason: a.cancelReason,
    cancelledBy: a.cancelledBy,
    completedAt: a.completedAt,
    cancelledAt: a.cancelledAt,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof Refusal) {
      const body: Record<string, unknown> = { code: error.code, message: error.message };
      if (error.fields) body.fields = error.fields;
      return res.status(error.status).json({ error: body });
    }
    return next(error);
  }
};

async function requireTicket(req: Request) {
  const ticket = await findAccessibleTicket(getPrisma(), sessionUser(req), Number(req.params.id));
  if (!ticket) throw ticketNotFound();
  return ticket;
}

// Step 5 of the guard order: the action must exist on this very ticket.
async function requireAction(req: Request, ticketId: number) {
  const id = Number(req.params.actionId);
  if (!isValidId(id)) throw actionNotFound();
  const action = await getPrisma().actionTaken.findFirst({ where: { id, ticketId }, select: { id: true } });
  if (!action) throw actionNotFound();
  return action.id;
}

async function lockTicket(tx: Prisma.TransactionClient, id: number) {
  const [row] = await tx.$queryRaw<{ currentStatus: TicketStatus; createdAt: Date }[]>`
    SELECT "currentStatus", "createdAt" FROM "Ticket" WHERE id = ${id} FOR UPDATE
  `;
  if (!row) throw ticketNotFound();
  return row;
}

// BR-08 — locked after the ticket (Lab 3 BR-81), so the assignee cannot be
// deactivated or demoted between this check and the write.
async function assigneeError(tx: Prisma.TransactionClient, userId: number): Promise<string | null> {
  const [user] = await tx.$queryRaw<{ role: string; isActive: boolean }[]>`
    SELECT role, "isActive" FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  if (!user || !user.isActive || (user.role !== "IT_STAFF" && user.role !== "ADMINISTRATOR")) {
    return "Choose an active IT Staff member or Administrator.";
  }
  return null;
}

const touchTicket = (tx: Prisma.TransactionClient, id: number) => tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } }); // BR-21

type Change = { from: unknown; to: unknown };
const jsonValue = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
function change(from: unknown, to: unknown): Change {
  return { from: jsonValue(from), to: jsonValue(to) };
}
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

// api-spec §1.2
const listActions = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const rows = await getPrisma().actionTaken.findMany({ where: { ticketId: ticket.id }, include: ACTION_INCLUDE, orderBy: ORDER });
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: rows.map(serializeAction) });
});

// BR-43 — a create the same user already made with this key.
async function replay(createdById: number, clientRequestId: string, ticketId: number) {
  const existing = await getPrisma().actionTaken.findUnique({
    where: { createdById_clientRequestId: { createdById, clientRequestId } },
    include: ACTION_INCLUDE,
  });
  if (!existing) return null;
  if (existing.ticketId !== ticketId) throw invalid({ clientRequestId: "This request id was already used for another ticket." });
  return existing;
}

// api-spec §1.3
const createAction = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const user = sessionUser(req);
  const parsed = parseCreateBody(req.body);
  if ("fields" in parsed) throw invalid(parsed.fields);
  const input = parsed.value;

  if (input.clientRequestId) {
    const earlier = await replay(user.id, input.clientRequestId, ticket.id);
    if (earlier) return res.status(200).json(serializeAction(earlier));
  }

  try {
    const created = await getPrisma().$transaction(async (tx) => {
      const locked = await lockTicket(tx, ticket.id);
      const fields: Record<string, string> = {};
      const assignee = await assigneeError(tx, input.assigneeId);
      if (assignee) fields.assigneeId = assignee;
      if (input.followUpOfId !== null) {
        // BR-14 — the action whose follow-up this handles: same ticket, completed, needing one.
        const target = await tx.actionTaken.findFirst({ where: { id: input.followUpOfId, ticketId: ticket.id }, select: { status: true, followUpRequired: true } });
        if (!target || target.status !== "COMPLETED" || !target.followUpRequired) fields.followUpOfId = "Choose a completed action of this ticket that needs a follow-up.";
      }
      const when = actionAtError(input.actionAt, input.status, { now: new Date(), ticketCreatedAt: locked.createdAt });
      if (when) fields.actionAt = when;
      if (Object.keys(fields).length > 0) throw invalid(fields);
      refuseForTicket(locked.currentStatus);

      const done = input.status === "COMPLETED";
      const action = await tx.actionTaken.create({
        data: {
          ticketId: ticket.id,
          actionAt: input.actionAt,
          description: input.description,
          result: input.result,
          status: input.status,
          assigneeId: input.assigneeId,
          createdById: user.id,
          performedById: done ? user.id : null, // BR-03, BR-11
          completedAt: done ? new Date() : null,
          followUpRequired: input.followUpRequired,
          followUpNote: input.followUpNote,
          attachmentNotes: input.attachmentNotes,
          followUpOfId: input.followUpOfId,
          clientRequestId: input.clientRequestId,
        },
        include: ACTION_INCLUDE,
      });
      const changes: Record<string, Change> = {};
      for (const key of ["status", "actionAt", "description", "assigneeId", "result", "followUpRequired", "followUpNote", "attachmentNotes", "followUpOfId"] as const) {
        if (action[key] !== null) changes[key] = change(null, action[key]);
      }
      await tx.actionTakenEvent.create({ data: { actionTakenId: action.id, type: "CREATED", actorId: user.id, changes: changes as Prisma.InputJsonValue } });
      await touchTicket(tx, ticket.id);
      return action;
    });
    return res.status(201).json(serializeAction(created));
  } catch (error) {
    // Two identical creates at once: the unique key let only one through (BR-43).
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const earlier = await replay(user.id, input.clientRequestId, ticket.id);
      if (earlier) return res.status(200).json(serializeAction(earlier));
    }
    throw error;
  }
});

// The state every write is checked against: read after the ticket lock.
async function lockedAction(tx: Prisma.TransactionClient, id: number): Promise<ActionTaken> {
  return tx.actionTaken.findUniqueOrThrow({ where: { id } });
}

// BR-25, BR-20, BR-13 — the conflicts, in the order api-spec §1.4 lists them.
function refuseConflicts(current: ActionTaken, expectedVersion: number, ticketStatus: TicketStatus) {
  if (current.version !== expectedVersion) throw stale();
  refuseForTicket(ticketStatus);
  if (!isActionEditable(current.status)) throw notPlanned();
}

// api-spec §1.4
const editAction = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const actionId = await requireAction(req, ticket.id);
  const user = sessionUser(req);
  const parsed = parseEditBody(req.body);
  if ("fields" in parsed) throw invalid(parsed.fields);
  const { expectedVersion, changes } = parsed.value;

  const saved = await getPrisma().$transaction(async (tx) => {
    const locked = await lockTicket(tx, ticket.id);
    const current = await lockedAction(tx, actionId);
    const fields: Record<string, string> = {};
    if (changes.assigneeId !== undefined && changes.assigneeId !== current.assigneeId) {
      const assignee = await assigneeError(tx, changes.assigneeId);
      if (assignee) fields.assigneeId = assignee;
    }
    if (changes.actionAt && !same(changes.actionAt, current.actionAt)) {
      const when = actionAtError(changes.actionAt, "PLANNED", { now: new Date(), ticketCreatedAt: locked.createdAt });
      if (when) fields.actionAt = when;
    }
    const followUp = resolveFollowUp(current, changes);
    if ("error" in followUp) fields.followUpNote = followUp.error;
    if (Object.keys(fields).length > 0) throw invalid(fields);
    refuseConflicts(current, expectedVersion, locked.currentStatus);

    const next = { ...current, ...changes, ...(followUp as { followUpRequired: boolean; followUpNote: string | null }) };
    const diff: Record<string, Change> = {};
    for (const key of ["actionAt", "description", "assigneeId", "result", "followUpRequired", "followUpNote", "attachmentNotes"] as const) {
      if (!same(current[key], next[key])) diff[key] = change(current[key], next[key]);
    }
    // BR-23 — nothing changed, nothing written.
    if (Object.keys(diff).length === 0) return tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: ACTION_INCLUDE });

    const updated = await tx.actionTaken.update({
      where: { id: actionId },
      data: {
        actionAt: next.actionAt,
        description: next.description,
        assigneeId: next.assigneeId,
        result: next.result,
        followUpRequired: next.followUpRequired,
        followUpNote: next.followUpNote,
        attachmentNotes: next.attachmentNotes,
        version: { increment: 1 },
      },
      include: ACTION_INCLUDE,
    });
    await tx.actionTakenEvent.create({ data: { actionTakenId: actionId, type: "UPDATED", actorId: user.id, changes: diff as Prisma.InputJsonValue } });
    await touchTicket(tx, ticket.id);
    return updated;
  });
  return res.status(200).json(serializeAction(saved));
});

// api-spec §1.5 — complete or cancel. Fields the request sent are checked before
// the conflicts; the stored values a completion inherits (its date, its result,
// its follow-up) are checked after them, so an action that is already final
// always answers ACTION_NOT_PLANNED rather than a complaint about its old values.
const changeActionStatus = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const actionId = await requireAction(req, ticket.id);
  const user = sessionUser(req);
  const parsed = parseStatusBody(req.body);
  if ("fields" in parsed) throw invalid(parsed.fields);
  const input = parsed.value;

  const saved = await getPrisma().$transaction(async (tx) => {
    const locked = await lockTicket(tx, ticket.id);
    const current = await lockedAction(tx, actionId);
    const now = new Date();
    const window = { now, ticketCreatedAt: locked.createdAt };
    if (input.status === "COMPLETED" && input.actionAt) {
      const when = actionAtError(input.actionAt, "COMPLETED", window);
      if (when) throw invalid({ actionAt: when });
    }
    refuseConflicts(current, input.expectedVersion, locked.currentStatus);

    const diff: Record<string, Change> = { status: change(current.status, input.status) };
    let data: Prisma.ActionTakenUpdateInput;
    if (input.status === "COMPLETED") {
      const fields: Record<string, string> = {};
      const result = input.result ?? current.result;
      if (!result) fields.result = "Enter the result.";
      const actionAt = input.actionAt ?? current.actionAt;
      const when = actionAtError(actionAt, "COMPLETED", window);
      if (when) fields.actionAt = `${when} Change the date to when the work was done.`;
      const followUp = resolveFollowUp(current, input);
      if ("error" in followUp) fields.followUpNote = followUp.error;
      if (Object.keys(fields).length > 0) throw invalid(fields);
      const final = followUp as { followUpRequired: boolean; followUpNote: string | null };
      for (const [key, to] of [["result", result], ["actionAt", actionAt], ["followUpRequired", final.followUpRequired], ["followUpNote", final.followUpNote]] as const) {
        if (!same(current[key], to)) diff[key] = change(current[key], to);
      }
      data = {
        status: "COMPLETED",
        result,
        actionAt,
        followUpRequired: final.followUpRequired,
        followUpNote: final.followUpNote,
        performedBy: { connect: { id: user.id } }, // BR-03, BR-11
        completedAt: now,
        version: { increment: 1 },
      };
    } else {
      diff.cancelReason = change(null, input.reason);
      data = { status: "CANCELLED", cancelReason: input.reason, cancelledBy: { connect: { id: user.id } }, cancelledAt: now, version: { increment: 1 } }; // BR-12
    }
    const updated = await tx.actionTaken.update({ where: { id: actionId }, data, include: ACTION_INCLUDE });
    await tx.actionTakenEvent.create({ data: { actionTakenId: actionId, type: input.status, actorId: user.id, changes: diff as Prisma.InputJsonValue } });
    await touchTicket(tx, ticket.id);
    return updated;
  });
  return res.status(200).json(serializeAction(saved));
});

// api-spec §1.6 — read-only; no route writes an event (BR-22).
const actionHistory = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const actionId = await requireAction(req, ticket.id);
  const data = await getPrisma().actionTakenEvent.findMany({
    where: { actionTakenId: actionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, type: true, createdAt: true, changes: true, actor: PERSON },
  });
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data });
});

export function registerActionsTakenRoutes(app: Express) {
  app.get("/api/tickets/:id/actions-taken", listActions);
  app.post("/api/tickets/:id/actions-taken", createAction);
  app.patch("/api/tickets/:id/actions-taken/:actionId", editAction);
  app.patch("/api/tickets/:id/actions-taken/:actionId/status", changeActionStatus);
  app.get("/api/tickets/:id/actions-taken/:actionId/history", actionHistory);
}
