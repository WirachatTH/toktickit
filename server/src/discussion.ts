import type { Express, NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { findAccessibleTicket, sessionUser } from "./authorization.js";
import { isClosedStatus } from "./ticketStatus.js";

// Lab 3, Issue 6 — Public Comments and Internal Notes (docs/lab-03/api-spec.md
// §4, specification.md BR-04, BR-25, BR-49 to BR-52, BR-80).
//
// Who may call each route is decided before any handler runs, by the route
// policies in authorization.ts (comments: Requester on their own ticket, IT
// Staff, Administrator read-only; notes: IT Staff, Administrator read-only).
// What is left here is the guard order's tail (BR-22): the ticket must exist and,
// for a Requester, be theirs (404) → the body must be valid (400) → business
// rules under the ticket-row lock (409).
//
// The two kinds live in two tables (BR-49), and every query below names its
// table explicitly, so no filter can ever let a note into a comment thread.
// There is deliberately no edit or delete route (BR-51).

const BODY_MAX = 2000;

const AUTHOR_SELECT = { select: { id: true, name: true, role: true, isActive: true } } as const;
const ENTRY_SELECT = { id: true, body: true, createdAt: true, author: AUTHOR_SELECT } as const;
const OLDEST_FIRST: Prisma.PublicCommentOrderByWithRelationInput[] = [{ createdAt: "asc" }, { id: "asc" }];

const TICKET_NOT_FOUND = { error: { code: "NOT_FOUND", message: "Ticket not found." } };
const TICKET_CLOSED = {
  error: { code: "TICKET_CLOSED", message: "This ticket is closed, so new comments are not accepted." },
};

class TicketClosedError extends Error {}

// BR-50 — 1 to 2000 characters after trimming. Only `body` is read: author and
// time always come from the server, whatever else the request carries.
function readBody(raw: unknown): { body: string } | { error: string } {
  const value = (raw as { body?: unknown } | null)?.body;
  if (typeof value !== "string" || value.trim() === "") return { error: "Enter a message." };
  const body = value.trim();
  if (body.length > BODY_MAX) return { error: `Keep it to ${BODY_MAX} characters or fewer.` };
  return { body };
}

function invalidBody(res: Response, message: string) {
  return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Some fields need attention.", fields: { body: message } } });
}

type Kind = "comment" | "note";

async function list(kind: Kind, req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const ticket = await findAccessibleTicket(prisma, sessionUser(req), Number(req.params.id));
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);
    const where = { ticketId: ticket.id };
    const data =
      kind === "comment"
        ? await prisma.publicComment.findMany({ where, select: ENTRY_SELECT, orderBy: OLDEST_FIRST })
        : await prisma.internalNote.findMany({ where, select: ENTRY_SELECT, orderBy: OLDEST_FIRST });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
}

async function create(kind: Kind, req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const user = sessionUser(req);
    const ticket = await findAccessibleTicket(prisma, user, Number(req.params.id));
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const parsed = readBody(req.body);
    if ("error" in parsed) return invalidBody(res, parsed.error);

    const entry = await prisma.$transaction(async (tx) => {
      // BR-80 — lock the ticket row, then check the status-dependent rule
      // against what is locked, never against the read above.
      const [locked] = await tx.$queryRaw<{ currentStatus: string }[]>`
        SELECT "currentStatus" FROM "Ticket" WHERE id = ${ticket.id} FOR UPDATE
      `;
      if (!locked) throw new TicketClosedError();
      // BR-52 — no new Public Comment on a closed ticket; notes are always allowed.
      if (kind === "comment" && isClosedStatus(locked.currentStatus)) throw new TicketClosedError();

      const data = { ticketId: ticket.id, authorId: user.id, body: parsed.body };
      const created =
        kind === "comment"
          ? await tx.publicComment.create({ data, select: ENTRY_SELECT })
          : await tx.internalNote.create({ data, select: ENTRY_SELECT });
      // BR-52 — posting either one is activity on the ticket.
      await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
      return created;
    });
    return res.status(201).json(entry);
  } catch (error) {
    if (error instanceof TicketClosedError) return res.status(409).json(TICKET_CLOSED);
    return next(error);
  }
}

export function registerDiscussionRoutes(app: Express) {
  app.get("/api/tickets/:id/comments", (req, res, next) => list("comment", req, res, next));
  app.post("/api/tickets/:id/comments", (req, res, next) => create("comment", req, res, next));
  app.get("/api/tickets/:id/internal-notes", (req, res, next) => list("note", req, res, next));
  app.post("/api/tickets/:id/internal-notes", (req, res, next) => create("note", req, res, next));
}
