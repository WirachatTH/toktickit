import type { Express, NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { sessionUser } from "./authorization.js";
import { parseQueueQuery, queueOrderBy, queueWhere } from "./queueQuery.js";

// Lab 3, Issue 7 — the IT Staff Ticket Queue and the assignable-users list
// (docs/lab-03/api-spec.md §5.1, §5.3). Both routes admit IT Staff and
// Administrators only; that is decided by the route policies in
// authorization.ts before these handlers run (BR-20, BR-21).

const PERSON = { select: { id: true, name: true, role: true, isActive: true } } as const;

// FR-21 — exactly the fields a queue row shows. Never the description, the
// resolution summary, attachments, or anything about comments or notes.
const QUEUE_ROW = {
  id: true,
  ticketNumber: true,
  summary: true,
  requester: PERSON,
  category: { select: { id: true, name: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  owner: PERSON,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function listQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const query = parseQueueQuery(req.query as Record<string, unknown>);
    const where = queueWhere(query, sessionUser(req).id);
    // One snapshot for both reads, so the total always matches the rows (a
    // ticket closed between two separate queries made them disagree — PR #57
    // review). Read committed would still give each statement its own
    // snapshot; repeatable read gives the transaction one.
    const [data, totalItems] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        select: QUEUE_ROW,
        orderBy: queueOrderBy(query.sort, query.order),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.ticket.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      data,
      // BR-67 — a page past the last is simply empty; the totals stay correct.
      pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) },
      // BR-66 — what was actually applied, so the UI can show the real state.
      appliedQuery: query,
    });
  } catch (error) {
    return next(error);
  }
}

// §5.3 — who a ticket may be assigned to (BR-29): active IT Staff and
// Administrators, by name. Fills the queue's Owner filter.
async function listAssignableUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getPrisma().user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
      select: PERSON.select,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
}

export function registerStaffQueueRoutes(app: Express) {
  app.get("/api/staff/tickets", listQueue);
  app.get("/api/staff/assignable-users", listAssignableUsers);
}
