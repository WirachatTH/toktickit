import type { Express, NextFunction, Request, Response } from "express";
import type { Prisma, Priority, Role, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { sessionUser } from "./authorization.js";
import { bangkokToday, DASHBOARD_TIME_ZONE, lastSevenDaysStart } from "./dashboardTime.js";
import { ACTIVE_STATUSES, TICKET_STATUSES, UNRESOLVED_STATUSES } from "./ticketFilters.js";

// Lab 4, Issue 5 — the three dashboards (docs/lab-04/api-spec.md §3;
// specification.md BR-33 to BR-42).
//
// Who may call each route is settled by the route policies (BR-15): one role
// each. Every value is counted by the database at request time (BR-34); the
// client only shows what it gets. Each endpoint runs a fixed set of count,
// group-by, and LIMIT 5 queries, so its cost does not grow with the number of
// tickets (D-17). Lists hold at most 5 items (BR-37), and a count with nothing
// to count is 0 because every metric is built from a count or a group.

const LIST_SIZE = 5;
const PERSON = { select: { id: true, name: true, role: true, isActive: true } } as const;
const TERMINAL: TicketStatus[] = ["CLOSED", "CANCELLED"];
const PRIORITIES_DESC: Priority[] = ["HIGH", "MEDIUM", "LOW"];

interface Metric {
  key: string;
  label: string;
  value: number;
  href: string;
}
const metric = (key: string, label: string, value: number, href: string): Metric => ({ key, label, value, href });
const label = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

function envelope(now: Date) {
  const today = bangkokToday(now);
  return { generatedAt: now, timeZone: DASHBOARD_TIME_ZONE, today };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    await fn(req, res);
  } catch (error) {
    return next(error); // never a partial payload: a failure is the safe 500 (api-spec §3)
  }
};

// api-spec §3.1 — only the session user's own tickets (BR-36); never IT Priority.
const requesterDashboard = handle(async (req, res) => {
  const prisma = getPrisma();
  const me = sessionUser(req).id;
  const now = new Date();
  const own: Prisma.TicketWhereInput = { requesterId: me };
  const item = { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true } as const;
  const newest: Prisma.TicketOrderByWithRelationInput[] = [{ updatedAt: "desc" }, { id: "desc" }];

  const [byStatus, needsAttention, recentlyUpdated, recentlyResolved] = await prisma.$transaction([
    prisma.ticket.groupBy({ by: ["currentStatus"], where: own, _count: { _all: true }, orderBy: { currentStatus: "asc" } }),
    prisma.ticket.findMany({ where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" }, select: item, orderBy: newest, take: LIST_SIZE }),
    prisma.ticket.findMany({ where: own, select: item, orderBy: newest, take: LIST_SIZE }),
    prisma.ticket.findMany({
      where: { ...own, currentStatus: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: lastSevenDaysStart(now) } },
      select: { ...item, resolvedAt: true },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: LIST_SIZE,
    }),
  ]);
  const count = (statuses: readonly TicketStatus[]) =>
    byStatus.filter((g) => statuses.includes(g.currentStatus)).reduce((sum, g) => sum + ((g._count as { _all: number })._all ?? 0), 0);
  const link = <T extends { id: number }>(t: T) => ({ ...t, href: `/tickets/${t.id}` });

  return res.status(200).json({
    ...envelope(now),
    metrics: [
      metric("unresolved", "Open requests", count(UNRESOLVED_STATUSES), "/tickets?status=UNRESOLVED"),
      metric("waitingForMe", "Waiting for you", count(["WAITING_FOR_REQUESTER"]), "/tickets?status=WAITING_FOR_REQUESTER"),
      metric("resolved", "Resolved", count(["RESOLVED"]), "/tickets?status=RESOLVED"),
      metric("closed", "Closed", count(["CLOSED"]), "/tickets?status=CLOSED"),
    ],
    lists: {
      needsAttention: needsAttention.map(link),
      recentlyUpdated: recentlyUpdated.map(link),
      recentlyResolved: recentlyResolved.map(link),
    },
  });
});

// api-spec §3.2 — the IT Staff payload for one user ("me"); §3.3 reuses it.
async function staffPayload(me: number, now: Date) {
  const prisma = getPrisma();
  const today = bangkokToday(now);
  const active: Prisma.TicketWhereInput = { currentStatus: { in: [...ACTIVE_STATUSES] } };
  const myPlanned: Prisma.ActionTakenWhereInput = { assigneeId: me, status: "PLANNED", ticket: { currentStatus: { notIn: TERMINAL } } };
  const item = { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true, itPriority: true, owner: PERSON } as const;

  const [unassigned, myTickets, myPlannedCount, appearsResolved, createdToday, resolvedToday, byStatus, byPriority, plannedList, urgent, recentlyUpdated] =
    await prisma.$transaction([
      prisma.ticket.count({ where: { ...active, ownerId: null } }),
      prisma.ticket.count({ where: { ...active, ownerId: me } }),
      prisma.actionTaken.count({ where: myPlanned }),
      prisma.ticket.count({ where: { ...active, requesterResolvedAt: { not: null } } }),
      prisma.ticket.count({ where: { createdAt: { gte: today.start, lt: today.end } } }),
      prisma.ticket.count({ where: { resolvedAt: { gte: today.start, lt: today.end }, currentStatus: { in: ["RESOLVED", "CLOSED"] } } }),
      prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true }, orderBy: { currentStatus: "asc" } }),
      prisma.ticket.groupBy({ by: ["itPriority"], where: { currentStatus: { in: [...UNRESOLVED_STATUSES] } }, _count: { _all: true }, orderBy: { itPriority: "asc" } }),
      prisma.actionTaken.findMany({
        where: myPlanned,
        select: { id: true, actionAt: true, description: true, ticket: { select: { id: true, ticketNumber: true, summary: true, currentStatus: true } } },
        orderBy: [{ actionAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
      }),
      prisma.ticket.findMany({
        where: { currentStatus: { in: [...UNRESOLVED_STATUSES] }, itPriority: "HIGH" },
        select: item,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
      }),
      prisma.ticket.findMany({ where: active, select: item, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: LIST_SIZE }),
    ]);

  const groupCount = <K extends string>(groups: { _count: unknown }[], key: K, value: string) =>
    ((groups.find((g) => (g as Record<K, string>)[key] === value)?._count as { _all: number } | undefined)?._all ?? 0);
  const link = <T extends { id: number }>(t: T) => ({ ...t, href: `/staff/tickets/${t.id}` });

  return {
    ...envelope(now),
    metrics: [
      metric("unassigned", "Unassigned", unassigned, "/staff/queue?owner=unassigned"),
      metric("myTickets", "My tickets", myTickets, "/staff/queue?owner=me"),
      metric("myPlannedActions", "My planned actions", myPlannedCount, "/dashboard#my-planned-actions"),
      metric("appearsResolved", "Requester says resolved", appearsResolved, "/staff/queue?appearsResolved=true"),
      metric("createdToday", "Created today", createdToday, "/staff/queue?status=ALL&sort=createdAt&order=desc"),
      metric("resolvedToday", "Resolved today", resolvedToday, "/staff/queue?status=ALL&sort=updatedAt&order=desc"),
    ],
    byStatus: TICKET_STATUSES.map((s) => metric(s, label(s), groupCount(byStatus, "currentStatus", s), `/staff/queue?status=${s}`)),
    byItPriority: PRIORITIES_DESC.map((p) => metric(p, label(p), groupCount(byPriority, "itPriority", p), `/staff/queue?status=UNRESOLVED&itPriority=${p}`)),
    lists: {
      myPlannedActions: plannedList.map((a) => ({
        actionId: a.id,
        actionAt: a.actionAt,
        description: a.description,
        ticket: a.ticket,
        href: `/staff/tickets/${a.ticket.id}#action-${a.id}`,
      })),
      urgent: urgent.map(link),
      recentlyUpdated: recentlyUpdated.map(link),
    },
  };
}

const staffDashboard = handle(async (req, res) => res.status(200).json(await staffPayload(sessionUser(req).id, new Date())));

// api-spec §3.3 — the IT Staff payload for the Administrator, plus user counts (BR-41).
const adminDashboard = handle(async (req, res) => {
  const payload = await staffPayload(sessionUser(req).id, new Date());
  const groups = await getPrisma().user.groupBy({ by: ["role", "isActive"], _count: { _all: true }, orderBy: { role: "asc" } });
  const activeIn = (role: Role) => groups.filter((g) => g.role === role && g.isActive).reduce((s, g) => s + ((g._count as { _all: number })._all ?? 0), 0);
  const inactive = groups.filter((g) => !g.isActive).reduce((s, g) => s + ((g._count as { _all: number })._all ?? 0), 0);
  return res.status(200).json({
    ...payload,
    users: [
      metric("activeRequesters", "Active Requesters", activeIn("REQUESTER"), "/admin/users?role=REQUESTER&status=active"),
      metric("activeItStaff", "Active IT Staff", activeIn("IT_STAFF"), "/admin/users?role=IT_STAFF&status=active"),
      metric("activeAdministrators", "Active Administrators", activeIn("ADMINISTRATOR"), "/admin/users?role=ADMINISTRATOR&status=active"),
      metric("inactive", "Inactive accounts", inactive, "/admin/users?status=inactive"),
    ],
  });
});

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/requester", requesterDashboard);
  app.get("/api/dashboard/staff", staffDashboard);
  app.get("/api/dashboard/admin", adminDashboard);
}
