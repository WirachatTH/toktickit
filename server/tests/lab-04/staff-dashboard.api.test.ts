import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient, Priority, Role, TicketStatus } from "@prisma/client";
import { ThrowawaySchema } from "../lab-03/helpers/throwawaySchema.js";
import { sessionCookieFor } from "../lab-03/helpers/sessions.js";
import { bangkokToday } from "../../src/dashboardTime.js";

// DASH-04 to DASH-09, DASH-11, DASH-12 — the IT Staff and Administrator
// dashboards (docs/lab-04/specification.md BR-33 to BR-42; api-spec §3.2, §3.3).
//
// Exact counts need a database holding exactly the tickets a test made, so this
// file builds a throwaway schema, points DATABASE_URL at it, and only then
// imports the app (Lab 3 D-22, as in last-administrator.api.test.ts). Every
// value is compared with an independent SQL count written here, never with a
// number typed into the test: that is the evidence that the dashboards match
// the database (labsheet §14 Part 5).

const schema = new ThrowawaySchema();
const originalUrl = process.env.DATABASE_URL;
let app: Express;
let prisma: PrismaClient;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const UNRESOLVED: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const ACTIVE: TicketStatus[] = [...UNRESOLVED, "RESOLVED"];

type Who = "me" | "colleague" | "admin" | "requester" | "fresh";
const users = {} as Record<Who, number>;
const cookies = {} as Record<Who, string>;
let category: number;
let system: number;
let n = 0;

async function ticket(data: { status: TicketStatus; owner?: number | null; it?: Priority; createdAt?: Date; updatedAt?: Date; resolvedAt?: Date | null; appearsResolved?: boolean }) {
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `SDB-${++n}`, requesterId: users.requester, ownerId: data.owner === undefined ? (data.status === "NEW" ? null : users.colleague) : data.owner,
      categoryId: category, relatedSystemId: system, summary: `Staff dashboard ${n}`, description: "Fixture.", itPriority: data.it ?? "MEDIUM",
      currentStatus: data.status, createdAt: data.createdAt ?? new Date(Date.now() - 30 * DAY),
      resolvedAt: data.resolvedAt !== undefined ? data.resolvedAt : data.status === "RESOLVED" || data.status === "CLOSED" ? new Date(Date.now() - 10 * DAY) : null,
      requesterResolvedAt: data.appearsResolved ? new Date() : null,
    },
  });
  if (data.updatedAt) await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${data.updatedAt} WHERE id = ${t.id}`;
  return t.id;
}

async function action(ticketId: number, status: "PLANNED" | "COMPLETED" | "CANCELLED", assigneeId: number, actionAt: Date) {
  const a = await prisma.actionTaken.create({
    data: {
      ticketId, actionAt, description: `Action on ${ticketId}`, status, assigneeId, createdById: assigneeId,
      result: status === "COMPLETED" ? "Done." : null, performedById: status === "COMPLETED" ? assigneeId : null,
      cancelReason: status === "CANCELLED" ? "Not needed after all." : null,
    },
  });
  return a.id;
}

const get = (path: string, who: Who) => request(app).get(path).set("Cookie", cookies[who]);
type Metric = { key: string; label: string; value: number; href: string };
const byKey = (list: Metric[], key: string) => list.find((m) => m.key === key)!;
async function count(sql: string, ...params: unknown[]) {
  const [{ n: c }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${sql}`, ...params);
  return Number(c);
}
async function ids(sql: string, ...params: unknown[]) {
  return (await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM ${sql}`, ...params)).map((r) => r.id).sort((a, b) => a - b);
}

// The BR-39 definitions, written as SQL from the spec.
function staffSql(me: number, today: { start: Date; end: Date }) {
  return {
    unassigned: [`"Ticket" WHERE "ownerId" IS NULL AND "currentStatus"::text = ANY($1)`, ACTIVE],
    myTickets: [`"Ticket" WHERE "ownerId" = $1 AND "currentStatus"::text = ANY($2)`, me, ACTIVE],
    myPlannedActions: [`"ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId" WHERE a."assigneeId" = $1 AND a.status = 'PLANNED' AND t."currentStatus"::text NOT IN ('CLOSED', 'CANCELLED')`, me],
    appearsResolved: [`"Ticket" WHERE "requesterResolvedAt" IS NOT NULL AND "currentStatus"::text = ANY($1)`, ACTIVE],
    createdToday: [`"Ticket" WHERE "createdAt" >= $1 AND "createdAt" < $2`, today.start, today.end],
    resolvedToday: [`"Ticket" WHERE "resolvedAt" >= $1 AND "resolvedAt" < $2 AND "currentStatus"::text IN ('RESOLVED', 'CLOSED')`, today.start, today.end],
  } as Record<string, [string, ...unknown[]]>;
}

beforeAll(async () => {
  await schema.create();
  schema.applyMigrations();
  process.env.DATABASE_URL = schema.url;
  app = (await import("../../src/app.js")).app;
  prisma = (await import("../../src/prisma.js")).getPrisma();
  category = (await prisma.category.create({ data: { name: "Hardware" } })).id;
  system = (await prisma.relatedSystem.create({ data: { name: "Laptop" } })).id;
  const make = async (key: Who, role: Role, isActive = true) => {
    const u = await prisma.user.create({ data: { name: `SDB ${key}`, email: `${key}@sdb.test`, role, isActive, mustChangePassword: false } });
    users[key] = u.id;
    cookies[key] = await sessionCookieFor(prisma, u.id);
  };
  await make("me", "IT_STAFF");
  await make("colleague", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
  await make("requester", "REQUESTER");
  await make("fresh", "REQUESTER");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await schema.drop();
  process.env.DATABASE_URL = originalUrl;
}, 240_000);

// First, while the schema holds no tickets at all.
describe("DASH-09 nothing to count (BR-37, AC-22)", () => {
  it("answers every dashboard with zeros and empty lists, never a missing value", async () => {
    for (const [path, who] of [["/api/dashboard/staff", "me"], ["/api/dashboard/admin", "admin"], ["/api/dashboard/requester", "fresh"]] as const) {
      const res = await get(path, who);
      expect(res.status, path).toBe(200);
      const metrics: Metric[] = [...res.body.metrics, ...(res.body.byStatus ?? []), ...(res.body.byItPriority ?? [])];
      expect(metrics.length, path).toBeGreaterThan(0);
      for (const m of metrics) expect(m.value, `${path} ${m.key}`).toBe(0);
      for (const [key, list] of Object.entries(res.body.lists)) expect(list, `${path} ${key}`).toEqual([]);
    }
    const admin = (await get("/api/dashboard/admin", "admin")).body;
    // Users exist even with no tickets.
    expect(byKey(admin.users, "activeItStaff").value).toBe(2);
  });
});

describe("with tickets", () => {
  const now = Date.now();
  const planned: number[] = [];
  const urgent: number[] = [];
  const recent: number[] = [];
  let beforeMidnight: number;
  let afterMidnight: number;

  beforeAll(async () => {
    // Two of every status, owned by the colleague, MEDIUM, created long ago.
    for (const status of ALL) {
      await ticket({ status });
      await ticket({ status, it: "LOW" });
    }
    // Mine: three active, one closed (never counted as mine).
    await ticket({ status: "OPEN", owner: users.me });
    await ticket({ status: "WAITING_FOR_REQUESTER", owner: users.me, appearsResolved: true });
    await ticket({ status: "RESOLVED", owner: users.me });
    await ticket({ status: "CLOSED", owner: users.me });
    // Unassigned: NEW and a cancelled one (never counted).
    await ticket({ status: "NEW", owner: null, appearsResolved: true });
    await ticket({ status: "CANCELLED", owner: null });
    // Seven urgent candidates, oldest first by creation.
    for (let i = 0; i < 7; i++) urgent.push(await ticket({ status: i % 2 ? "IN_PROGRESS" : "OPEN", it: "HIGH", createdAt: new Date(now - (60 - i) * DAY) }));
    await ticket({ status: "RESOLVED", it: "HIGH" }); // HIGH but resolved: not urgent
    // Seven freshly updated active tickets, newest first.
    for (let i = 0; i < 7; i++) recent.push(await ticket({ status: "IN_PROGRESS", updatedAt: new Date(now + (10 - i) * 60_000) }));
    // My planned actions: seven on working tickets, plus ones that never count.
    const work = await ticket({ status: "IN_PROGRESS" });
    for (let i = 0; i < 7; i++) planned.push(await action(work, "PLANNED", users.me, new Date(now + (i + 1) * HOUR)));
    await action(work, "PLANNED", users.colleague, new Date(now + HOUR)); // the colleague's
    await action(work, "COMPLETED", users.me, new Date(now - HOUR)); // mine but done
    await action(work, "CANCELLED", users.me, new Date(now - HOUR)); // mine but cancelled
    const dead = await ticket({ status: "CANCELLED" });
    await action(dead, "PLANNED", users.me, new Date(now + HOUR)); // on a cancelled ticket (D-18)
    // The Bangkok midnight that started today, and a ticket either side of it (BR-33).
    const today = bangkokToday(new Date());
    beforeMidnight = await ticket({ status: "RESOLVED", createdAt: new Date(today.start.getTime() - 1000), resolvedAt: new Date(today.start.getTime() - 1000) });
    afterMidnight = await ticket({ status: "CLOSED", createdAt: new Date(today.start.getTime() + 1000), resolvedAt: new Date(today.start.getTime() + 1000) });
    // A legacy-shaped ticket: no actions, resolvedAt backfilled from updatedAt (BR-42, BR-47).
    await ticket({ status: "CLOSED", resolvedAt: new Date(now - 40 * DAY), updatedAt: new Date(now - 40 * DAY) });
  }, 240_000);

  it("DASH-04 every IT Staff metric, status count, and priority count equals its SQL count (BR-39, AC-19)", async () => {
    const res = await get("/api/dashboard/staff", "me");
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.timeZone).toBe("Asia/Bangkok");
    const today = { start: new Date(body.today.start), end: new Date(body.today.end) };
    expect(today).toEqual(bangkokToday(new Date(body.generatedAt)));
    expect(body.metrics.map((m: Metric) => m.key)).toEqual(["unassigned", "myTickets", "myPlannedActions", "appearsResolved", "createdToday", "resolvedToday"]);
    const sql = staffSql(users.me, today);
    for (const m of body.metrics as Metric[]) {
      const [from, ...params] = sql[m.key];
      expect(m.value, m.key).toBe(await count(from, ...params));
      expect(m.value, `${m.key} must not be trivially zero here`).toBeGreaterThan(0);
    }
    expect(body.byStatus.map((m: Metric) => m.key)).toEqual(ALL);
    for (const m of body.byStatus as Metric[]) {
      expect(m.value, m.key).toBe(await count(`"Ticket" WHERE "currentStatus"::text = $1`, m.key));
      expect(m.href).toBe(`/staff/queue?status=${m.key}`);
    }
    expect(body.byItPriority.map((m: Metric) => m.key)).toEqual(["HIGH", "MEDIUM", "LOW"]);
    for (const m of body.byItPriority as Metric[]) {
      expect(m.value, m.key).toBe(await count(`"Ticket" WHERE "itPriority"::text = $1 AND "currentStatus"::text = ANY($2)`, m.key, UNRESOLVED));
      expect(m.href).toBe(`/staff/queue?status=UNRESOLVED&itPriority=${m.key}`);
    }
    expect(byKey(body.metrics, "unassigned")).toMatchObject({ label: "Unassigned", href: "/staff/queue?owner=unassigned" });
    expect(byKey(body.metrics, "myTickets")).toMatchObject({ label: "My tickets", href: "/staff/queue?owner=me" });
    expect(byKey(body.metrics, "myPlannedActions")).toMatchObject({ label: "My planned actions", href: "/dashboard#my-planned-actions" });
    expect(byKey(body.metrics, "appearsResolved")).toMatchObject({ label: "Requester says resolved", href: "/staff/queue?appearsResolved=true" });
    expect(byKey(body.metrics, "createdToday")).toMatchObject({ label: "Created today", href: "/staff/queue?status=ALL&sort=createdAt&order=desc" });
    expect(byKey(body.metrics, "resolvedToday")).toMatchObject({ label: "Resolved today", href: "/staff/queue?status=ALL&sort=updatedAt&order=desc" });
  });

  it("DASH-05 'my planned actions' are only mine, still planned, on tickets still open, in date order (BR-39, D-18)", async () => {
    const { body } = await get("/api/dashboard/staff", "me");
    expect(byKey(body.metrics, "myPlannedActions").value).toBe(7);
    expect(body.lists.myPlannedActions.map((a: { actionId: number }) => a.actionId)).toEqual(planned.slice(0, 5));
    expect(body.lists.myPlannedActions[0]).toEqual({
      actionId: planned[0], actionAt: expect.any(String), description: expect.any(String),
      ticket: { id: expect.any(Number), ticketNumber: expect.stringMatching(/^SDB-/), summary: expect.any(String), currentStatus: "IN_PROGRESS" },
      href: expect.stringMatching(new RegExp(`^/staff/tickets/\\d+#action-${planned[0]}$`)),
    });
    // The colleague sees only their own one.
    const theirs = (await get("/api/dashboard/staff", "colleague")).body;
    expect(byKey(theirs.metrics, "myPlannedActions").value).toBe(1);
  });

  it("DASH-06 the urgent and recently updated lists: content, order, and limit (BR-39)", async () => {
    const { body } = await get("/api/dashboard/staff", "me");
    expect(body.lists.urgent.map((t: { id: number }) => t.id)).toEqual(urgent.slice(0, 5));
    for (const t of body.lists.urgent) expect(t.itPriority).toBe("HIGH");
    expect(body.lists.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(recent.slice(0, 5));
    expect(body.lists.recentlyUpdated[0]).toEqual({
      id: recent[0], ticketNumber: expect.any(String), summary: expect.any(String), currentStatus: "IN_PROGRESS", updatedAt: expect.any(String),
      itPriority: "MEDIUM", owner: { id: users.colleague, name: "SDB colleague", role: "IT_STAFF", isActive: true }, href: `/staff/tickets/${recent[0]}`,
    });
  });

  it("DASH-07 the Administrator sees the IT Staff payload for themselves, plus user counts equal to SQL (BR-41, AC-20)", async () => {
    const owned = await ticket({ status: "OPEN", owner: users.admin });
    const res = await get("/api/dashboard/admin", "admin");
    expect(res.status).toBe(200);
    const body = res.body;
    expect(byKey(body.metrics, "myTickets").value).toBe(await count(`"Ticket" WHERE "ownerId" = $1 AND "currentStatus"::text = ANY($2)`, users.admin, ACTIVE));
    expect(byKey(body.metrics, "myTickets").value).toBeGreaterThan(0);
    expect(byKey(body.metrics, "unassigned").value).toBe((await get("/api/dashboard/staff", "me")).body.metrics[0].value);
    const userSql = (role: Role) => count(`"User" WHERE role::text = $1 AND "isActive"`, role);
    expect(body.users).toEqual([
      { key: "activeRequesters", label: "Active Requesters", value: await userSql("REQUESTER"), href: "/admin/users?role=REQUESTER&status=active" },
      { key: "activeItStaff", label: "Active IT Staff", value: await userSql("IT_STAFF"), href: "/admin/users?role=IT_STAFF&status=active" },
      { key: "activeAdministrators", label: "Active Administrators", value: await userSql("ADMINISTRATOR"), href: "/admin/users?role=ADMINISTRATOR&status=active" },
      { key: "inactive", label: "Inactive accounts", value: await count(`"User" WHERE NOT "isActive"`), href: "/admin/users?status=inactive" },
    ]);
    await prisma.ticket.delete({ where: { id: owned } });
  });

  it("DASH-08 counts 'today' by the Bangkok day: a ticket one second before midnight is yesterday's (BR-33, AC-21)", async () => {
    const { body } = await get("/api/dashboard/staff", "me");
    const today = { start: new Date(body.today.start), end: new Date(body.today.end) };
    const created = await ids(`"Ticket" WHERE "createdAt" >= $1 AND "createdAt" < $2`, today.start, today.end);
    expect(created).toContain(afterMidnight);
    expect(created).not.toContain(beforeMidnight);
    expect(byKey(body.metrics, "createdToday").value).toBe(created.length);
    const resolved = await ids(`"Ticket" WHERE "resolvedAt" >= $1 AND "resolvedAt" < $2`, today.start, today.end);
    expect(resolved).toEqual([afterMidnight]);
    expect(byKey(body.metrics, "resolvedToday").value).toBe(1);
  });

  it("DASH-11 every drill-down lists exactly what its metric counts, or, for the two 'today' metrics, a superset sorted by recency (BR-38, AC-23)", async () => {
    const { body } = await get("/api/dashboard/staff", "me");
    const today = { start: new Date(body.today.start), end: new Date(body.today.end) };
    const sql = staffSql(users.me, today);
    const follow = async (href: string, who: Who) => {
      const [route, query] = href.split("?");
      const api = route === "/staff/queue" ? "/api/staff/tickets" : route === "/tickets" ? "/api/tickets" : "/api/admin/users";
      return (await get(`${api}?${query}&pageSize=50`, who)).body;
    };
    for (const m of [...body.metrics, ...body.byStatus, ...body.byItPriority] as Metric[]) {
      if (m.key === "myPlannedActions") continue; // drills to the list on the dashboard itself
      const listed = await follow(m.href, "me");
      const listedIds = listed.data.map((t: { id: number }) => t.id);
      const counted = sql[m.key]
        ? await ids(...(sql[m.key] as [string, ...unknown[]]))
        : m.key.length > 0 && ALL.includes(m.key as TicketStatus)
          ? await ids(`"Ticket" WHERE "currentStatus"::text = $1`, m.key)
          : await ids(`"Ticket" WHERE "itPriority"::text = $1 AND "currentStatus"::text = ANY($2)`, m.key, UNRESOLVED);
      if (m.key === "createdToday" || m.key === "resolvedToday") {
        // A superset: every counted ticket is there, and the newest come first.
        for (const id of counted) expect(listedIds, `${m.key} includes ${id}`).toContain(id);
        const field = m.key === "createdToday" ? "createdAt" : "updatedAt";
        const times = listed.data.map((t: Record<string, string>) => Date.parse(t[field]));
        expect([...times].sort((a, b) => b - a), m.key).toEqual(times);
      } else {
        expect(listed.pagination.totalItems, m.key).toBe(m.value);
        expect([...listedIds].sort((a: number, b: number) => a - b), m.key).toEqual(counted);
      }
    }
    // The Requester's and the user-count links lead to exactly what they count, too.
    const requesterBody = (await get("/api/dashboard/requester", "requester")).body;
    for (const m of requesterBody.metrics as Metric[]) {
      const listed = await follow(m.href, "requester");
      expect(listed.pagination.totalItems, m.key).toBe(m.value);
    }
    const adminBody = (await get("/api/dashboard/admin", "admin")).body;
    for (const m of adminBody.users as Metric[]) {
      const listed = await follow(m.href, "admin");
      expect(listed.data.length, m.key).toBe(m.value);
    }
  });

  it("DASH-12 legacy tickets without actions count like any other (BR-42)", async () => {
    const legacy = await ticket({ status: "IN_PROGRESS", owner: users.me, updatedAt: new Date(now - 90 * DAY) });
    const { body } = await get("/api/dashboard/staff", "me");
    expect(byKey(body.metrics, "myTickets").value).toBe(await count(`"Ticket" WHERE "ownerId" = $1 AND "currentStatus"::text = ANY($2)`, users.me, ACTIVE));
    expect(await prisma.actionTaken.count({ where: { ticketId: legacy } })).toBe(0);
    expect(byKey(body.byStatus, "CLOSED").value).toBe(await count(`"Ticket" WHERE "currentStatus" = 'CLOSED'`));
  });
});
