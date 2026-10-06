import type { Express, NextFunction, Request, Response } from "express";
import type { Prisma, PrismaClient, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { findAccessibleTicket, isValidId, sessionUser } from "./authorization.js";
import type { SessionUser } from "./session.js";
import { isClosedStatus } from "./ticketStatus.js";
import { isPermittedTransition, isTicketStatus, permittedTransitions, requiredText, requiresOwner, statusTextError } from "./ticketWorkflow.js";

// Lab 3, Issue 8 — IT Staff Ticket Detail and the ticket workflow
// (docs/lab-03/api-spec.md §5.2, §5.4 to §5.6; BR-29 to BR-48, BR-80, BR-81).
//
// Who may call each route was decided before these handlers run (route
// policies in authorization.ts: detail for IT Staff and Administrators, every
// change for IT Staff only). What is left is the BR-22 order's tail, the same
// in every handler:
//   ticket exists (404) → body valid (400) → lock the ticket row, then the
//   proposed owner's row (BR-80, BR-81) → business rules against what is
//   locked (409) → write.
// The lock makes concurrent changes to one ticket run one after the other, each
// checked against the result of the one before; `expectedStatus` and
// `expectedOwnerId` make a change that was based on an old screen fail instead
// of overwriting (BR-31, BR-43).

const PERSON = { select: { id: true, name: true, role: true, isActive: true } } as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const UNASSIGNABLE_FROM: TicketStatus[] = ["NEW", "OPEN"]; // BR-36

class Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}
const stale = () => new Refusal(409, "STALE_STATE", "This ticket was changed by someone else. Reload it and try again.");
const closed = () => new Refusal(409, "TICKET_CLOSED", "This ticket is closed, so it can't be changed.");

function send(res: Response, refusal: Refusal) {
  const error: Record<string, unknown> = { code: refusal.code, message: refusal.message };
  if (refusal.fields) error.fields = refusal.fields;
  return res.status(refusal.status).json({ error });
}

const invalid = (fields: Record<string, string>) => new Refusal(400, "VALIDATION_ERROR", "Some fields need attention.", fields);

// A required field that may be null: the key must be present, the value null
// or a valid id. `undefined` means "not sent", which is not the same as null.
function nullableId(body: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  return typeof value === "number" && isValidId(value) ? value : undefined;
}

async function lockTicket(tx: Prisma.TransactionClient, id: number) {
  const [row] = await tx.$queryRaw<{ currentStatus: TicketStatus; ownerId: number | null }[]>`
    SELECT "currentStatus", "ownerId" FROM "Ticket" WHERE id = ${id} FOR UPDATE
  `;
  if (!row) throw new Refusal(404, "NOT_FOUND", "Ticket not found.");
  return row;
}

// §5.2 — the full ticket, plus what the caller may do with it right now. The
// UI renders from `capabilities`; the server re-checks every change anyway (BR-27).
export async function staffTicketPayload(prisma: PrismaClient | Prisma.TransactionClient, id: number, user: SessionUser) {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      requester: { select: { id: true, name: true, email: true, isActive: true } },
      category: { select: { id: true, name: true } },
      relatedSystem: { select: { id: true, name: true } },
      summary: true,
      description: true,
      requestedPriority: true,
      itPriority: true,
      currentStatus: true,
      owner: PERSON,
      resolutionSummary: true,
      requesterResolvedAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true, uploadedAt: true, isRemoved: true, removedAt: true, removedReason: true },
      },
    },
  });
  const isStaff = user.role === "IT_STAFF";
  const terminal = isClosedStatus(ticket.currentStatus);
  const transitions = isStaff ? permittedTransitions(ticket.currentStatus) : [];
  return {
    ...ticket,
    permittedTransitions: transitions,
    // An Administrator may look at everything and change nothing (BR-21).
    capabilities: {
      canAssign: isStaff && !terminal,
      canChangePriority: isStaff && !terminal,
      canChangeStatus: transitions.length > 0,
      canPostComment: isStaff && !terminal,
      canPostNote: isStaff,
      // Lab 4 BR-17, BR-20 — IT Staff and Administrators write Actions Taken
      // while the ticket is being worked (not resolved, closed, or cancelled).
      canWriteActions: !terminal && ticket.currentStatus !== "RESOLVED",
    },
  };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof Refusal) return send(res, error);
    return next(error);
  }
};

async function requireTicket(req: Request) {
  const ticket = await findAccessibleTicket(getPrisma(), sessionUser(req), Number(req.params.id));
  if (!ticket) throw new Refusal(404, "NOT_FOUND", "Ticket not found.");
  return ticket;
}

// §5.2
const getDetail = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  res.set("Cache-Control", "no-store");
  return res.status(200).json(await staffTicketPayload(getPrisma(), ticket.id, sessionUser(req)));
});

// §5.4 — claim, assign, reassign, unassign (BR-29 to BR-32, BR-36, BR-37).
const changeOwner = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const user = sessionUser(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ownerId = nullableId(body, "ownerId");
  const expectedOwnerId = nullableId(body, "expectedOwnerId");
  const expectedStatus = body.expectedStatus;
  const fields: Record<string, string> = {};
  if (ownerId === undefined) fields.ownerId = "Choose an owner, or none.";
  if (expectedOwnerId === undefined) fields.expectedOwnerId = "Send the owner the screen shows (or null).";
  if (!isTicketStatus(expectedStatus)) fields.expectedStatus = "Send the status the screen shows.";
  if (Object.keys(fields).length > 0) throw invalid(fields);

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const locked = await lockTicket(tx, ticket.id);
    if (ownerId !== null) {
      // BR-81 — the ticket first, then the proposed owner's row, so a role or
      // activation change to that user cannot slip in between check and write.
      const [owner] = await tx.$queryRaw<{ role: string; isActive: boolean }[]>`
        SELECT role, "isActive" FROM "User" WHERE id = ${ownerId} FOR UPDATE
      `;
      // BR-29 — eligible at the moment of assignment.
      if (!owner || !owner.isActive || (owner.role !== "IT_STAFF" && owner.role !== "ADMINISTRATOR")) {
        throw invalid({ ownerId: "Choose an active IT Staff member or Administrator." });
      }
    }
    if (locked.ownerId !== expectedOwnerId || locked.currentStatus !== expectedStatus) throw stale();
    if (isClosedStatus(locked.currentStatus)) throw closed();
    if (ownerId === null && !UNASSIGNABLE_FROM.includes(locked.currentStatus)) {
      throw new Refusal(409, "OWNER_REQUIRED", "A ticket past Open keeps an owner; reassign it instead.");
    }
    // BR-32 — a NEW ticket that gets an owner opens, in the same change; any
    // status change clears the Requester's appears-resolved signal (BR-48).
    const opens = locked.currentStatus === "NEW" && ownerId !== null;
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { ownerId, ...(opens ? { currentStatus: "OPEN", requesterResolvedAt: null } : {}) },
    });
  });
  return res.status(200).json(await staffTicketPayload(prisma, ticket.id, user));
});

// §5.5 — IT Priority; Requested Priority is never read from the body (BR-33, BR-34).
const changeItPriority = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  if (!(PRIORITIES as readonly unknown[]).includes(body.itPriority)) fields.itPriority = "Choose Low, Medium, or High.";
  if (!isTicketStatus(body.expectedStatus)) fields.expectedStatus = "Send the status the screen shows.";
  if (Object.keys(fields).length > 0) throw invalid(fields);

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const locked = await lockTicket(tx, ticket.id);
    if (locked.currentStatus !== body.expectedStatus) throw stale();
    if (isClosedStatus(locked.currentStatus)) throw closed();
    await tx.ticket.update({ where: { id: ticket.id }, data: { itPriority: body.itPriority as (typeof PRIORITIES)[number] } });
  });
  return res.status(200).json(await staffTicketPayload(prisma, ticket.id, sessionUser(req)));
});

// §5.6 — status (BR-41 to BR-45, BR-48). Everything the body alone can show is
// checked first, so it is always 400 before any 409 (BR-22, API-78).
const changeStatus = handle(async (req, res) => {
  const ticket = await requireTicket(req);
  const user = sessionUser(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const target = body.status;
  const expectedOwnerId = nullableId(body, "expectedOwnerId");
  if (!isTicketStatus(target)) fields.status = "Choose a status.";
  if (!isTicketStatus(body.expectedStatus)) fields.expectedStatus = "Send the status the screen shows.";
  if (expectedOwnerId === undefined) fields.expectedOwnerId = "Send the owner the screen shows (or null).";
  if (isTicketStatus(target)) Object.assign(fields, statusTextError(target, body) ?? {});
  if (Object.keys(fields).length > 0) throw invalid(fields);
  const to = target as TicketStatus;
  const text = requiredText(to);
  const value = text ? String(body[text.field]).trim() : null;

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const locked = await lockTicket(tx, ticket.id);
    if (locked.currentStatus !== body.expectedStatus || locked.ownerId !== expectedOwnerId) throw stale();
    if (!isPermittedTransition(locked.currentStatus, to)) {
      throw new Refusal(409, "INVALID_TRANSITION", "That status change isn't allowed from the ticket's current status.");
    }
    if (requiresOwner(to) && locked.ownerId === null) {
      throw new Refusal(409, "OWNER_REQUIRED", "Assign an owner to move this ticket forward.");
    }
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        currentStatus: to,
        requesterResolvedAt: null, // BR-48
        ...(to === "RESOLVED" ? { resolutionSummary: value } : {}),
        ...(to === "REOPENED" ? { resolutionSummary: null } : {}), // BR-44
      },
    });
    // BR-45 — the reason reaches the Requester as the actor's Public Comment,
    // in this same transaction: if it cannot be stored, the status does not change.
    if (text?.field === "reason" && value) {
      await tx.publicComment.create({ data: { ticketId: ticket.id, authorId: user.id, body: value } });
    }
  });
  return res.status(200).json(await staffTicketPayload(prisma, ticket.id, user));
});

export function registerStaffTicketRoutes(app: Express) {
  app.get("/api/staff/tickets/:id", getDetail);
  app.patch("/api/staff/tickets/:id/owner", changeOwner);
  app.patch("/api/staff/tickets/:id/it-priority", changeItPriority);
  app.patch("/api/staff/tickets/:id/status", changeStatus);
}
