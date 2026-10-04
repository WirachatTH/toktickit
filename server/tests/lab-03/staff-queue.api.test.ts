import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Priority, Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// API-29 to API-40, API-79, API-59 — the IT Staff Ticket Queue and the
// assignable-users list (docs/lab-03/api-spec.md §5.1, §5.3; BR-61 to BR-67).
//
// The queue lists every ticket in the database, seeded ones included, so this
// file (D-22) either narrows each request to its own fixtures with a unique
// search term, or checks properties that hold whatever else is there (every row
// non-terminal; the rows in the documented order; totals equal to a count).

const prisma = getPrisma();
const stamp = Date.now();
const TAG = `Q${stamp}`;
const CORE = `${TAG} core`;
const BULK = `${TAG} bulk`;

type Who = "staff" | "staff2" | "admin" | "requester";
const users = {} as Record<Who | "otherRequester" | "inactiveStaff", number>;
const cookies = {} as Record<Who, string>;
const ticketIds: number[] = [];
let catA: number;
let catB: number;
let system: number;

const STATUS_ORDER: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const PRIORITY_ORDER: Priority[] = ["LOW", "MEDIUM", "HIGH"];

interface Row {
  id: number;
  ticketNumber: string;
  summary: string;
  requester: { id: number; name: string };
  category: { id: number };
  itPriority: Priority;
  requestedPriority: Priority;
  currentStatus: TicketStatus;
  owner: { id: number } | null;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const core: Record<string, number> = {};

async function ticket(key: string, data: {
  status: TicketStatus; it: Priority; requested?: Priority; owner?: number | null; cat: number; requester: number;
  createdAt: Date; updatedAt?: Date; resolvedFlag?: boolean; summary?: string; number?: string;
}) {
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: data.number ?? `QQ${stamp}${String(ticketIds.length).padStart(3, "0")}`,
      requesterId: data.requester,
      categoryId: data.cat,
      relatedSystemId: system,
      summary: data.summary ?? `${CORE} ${key}`,
      description: "Queue suite fixture — never shown in the queue.",
      requestedPriority: data.requested ?? data.it,
      itPriority: data.it,
      currentStatus: data.status,
      ownerId: data.owner ?? null,
      requesterResolvedAt: data.resolvedFlag ? new Date("2026-09-30T00:00:00Z") : null,
      createdAt: data.createdAt,
    },
  });
  if (data.updatedAt) await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${data.updatedAt} WHERE id = ${row.id}`;
  ticketIds.push(row.id);
  core[key] = row.id;
  return row.id;
}

const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n, 8));

beforeAll(async () => {
  const [a, b] = await prisma.category.findMany({ orderBy: { id: "asc" }, take: 2 });
  catA = a.id;
  catB = b.id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const make = async (key: keyof typeof users, role: Role, name: string, isActive = true) => {
    const user = await prisma.user.create({
      data: { name, email: `queue.${key.toLowerCase()}.${stamp}@kmutt.ac.th`, role, isActive, mustChangePassword: false },
    });
    users[key] = user.id;
    if (isActive && key !== "otherRequester") cookies[key as Who] = await sessionCookieFor(prisma, user.id);
  };
  await make("staff", "IT_STAFF", `Queue Staff ${stamp}`);
  await make("staff2", "IT_STAFF", `Queue Staff Two ${stamp}`);
  await make("admin", "ADMINISTRATOR", `Queue Admin ${stamp}`);
  await make("requester", "REQUESTER", `Alpha Requester ${TAG}`);
  await make("otherRequester", "REQUESTER", `Beta Requester ${TAG}`);
  await make("inactiveStaff", "IT_STAFF", `Queue Inactive ${stamp}`, false);

  const R = users.requester;
  const R2 = users.otherRequester;
  await ticket("new-high", { status: "NEW", it: "HIGH", requested: "LOW", cat: catA, requester: R, createdAt: day(1), updatedAt: day(20) });
  await ticket("open-medium", { status: "OPEN", it: "MEDIUM", owner: users.staff, cat: catA, requester: R, createdAt: day(2), updatedAt: day(15) });
  await ticket("progress-high", { status: "IN_PROGRESS", it: "HIGH", owner: users.staff2, cat: catB, requester: R2, createdAt: day(3), updatedAt: day(18), resolvedFlag: true });
  await ticket("waiting-low", { status: "WAITING_FOR_REQUESTER", it: "LOW", owner: users.staff, cat: catB, requester: R2, createdAt: day(4), updatedAt: day(11) });
  await ticket("resolved-medium", { status: "RESOLVED", it: "MEDIUM", owner: users.admin, cat: catA, requester: R, createdAt: day(5), updatedAt: day(19) });
  await ticket("closed-low", { status: "CLOSED", it: "LOW", owner: users.staff, cat: catA, requester: R2, createdAt: day(6), updatedAt: day(12) });
  await ticket("reopened-high", { status: "REOPENED", it: "HIGH", cat: catB, requester: R, createdAt: day(7), updatedAt: day(13) });
  await ticket("cancelled-medium", { status: "CANCELLED", it: "MEDIUM", owner: users.inactiveStaff, cat: catA, requester: R2, createdAt: day(8), updatedAt: day(14) });
  // API-36: 25 tickets that agree on every sort value but id.
  for (let i = 0; i < 25; i++) {
    await ticket(`bulk-${i}`, { status: "NEW", it: "MEDIUM", cat: catB, requester: R, createdAt: day(9), summary: BULK });
  }
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

function queue(who: Who, query: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  return request(app).get(`/api/staff/tickets${qs ? `?${qs}` : ""}`).set("Cookie", cookies[who]);
}
const ids = (rows: Row[]) => rows.map((r) => r.id);
const keysOf = (rows: Row[]) => rows.map((r) => Object.entries(core).find(([, id]) => id === r.id)?.[0]);

// The documented full key for each sort (BR-64), as a comparator.
function compareBy(sort: string, order: "asc" | "desc") {
  const dir = order === "asc" ? 1 : -1;
  const rank = (r: Row) =>
    sort === "itPriority" ? PRIORITY_ORDER.indexOf(r.itPriority)
      : sort === "status" ? STATUS_ORDER.indexOf(r.currentStatus)
      : sort === "ticketNumber" ? r.ticketNumber
      : Date.parse(sort === "createdAt" ? r.createdAt : r.updatedAt);
  return (a: Row, b: Row) => {
    const x = rank(a), y = rank(b);
    if (x !== y) return (x < y ? -1 : 1) * dir;
    if (sort === "itPriority") {
      const c = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (c !== 0) return c;
      return a.id - b.id;
    }
    return (a.id - b.id) * dir;
  };
}
const expectOrdered = (rows: Row[], sort: string, order: "asc" | "desc", label = "") =>
  expect(ids(rows), `${sort} ${order} ${label}`).toEqual(ids([...rows].sort(compareBy(sort, order))));

describe("the default view (BR-62, BR-63, BR-65)", () => {
  it("API-29 lists every non-terminal ticket, most urgent and longest waiting first, with correct pagination", async () => {
    const res = await queue("staff");
    expect(res.status).toBe(200);
    const total = await prisma.ticket.count({ where: { currentStatus: { notIn: ["CLOSED", "CANCELLED"] } } });
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 10, totalItems: total, totalPages: Math.ceil(total / 10) });
    expect(res.body.data).toHaveLength(Math.min(10, total));
    for (const row of res.body.data as Row[]) expect(["CLOSED", "CANCELLED"]).not.toContain(row.currentStatus);
    expectOrdered(res.body.data, "itPriority", "desc", "page 1");

    // Our own core tickets, in the same default order, terminal ones left out.
    const mine = await queue("staff", { search: CORE });
    expect(keysOf(mine.body.data)).toEqual(["new-high", "progress-high", "reopened-high", "open-medium", "resolved-medium", "waiting-low"]);
  });
});

describe("search (BR-61)", () => {
  it("API-30 matches Ticket Number prefix, Summary substring, and Requester name, case-insensitively; blank means no search", async () => {
    const byNumber = await queue("staff", { search: `qq${stamp}00`, status: "ALL" });
    expect(byNumber.body.data.length).toBe(10); // QQ…000 to QQ…009
    for (const row of byNumber.body.data as Row[]) expect(row.ticketNumber.startsWith(`QQ${stamp}00`)).toBe(true);
    // A Ticket Number in the middle is not a prefix.
    expect((await queue("staff", { search: `${stamp}001`, status: "ALL" })).body.pagination.totalItems).toBe(0);

    const bySummary = await queue("staff", { search: "CORE REOPENED", status: "ALL" });
    expect(ids(bySummary.body.data)).toEqual([core["reopened-high"]]);

    const byRequester = await queue("staff", { search: `beta requester ${TAG.toLowerCase()}`, status: "ALL", pageSize: 50 });
    expect(new Set(keysOf(byRequester.body.data))).toEqual(new Set(["progress-high", "waiting-low", "closed-low", "cancelled-medium"]));

    const blank = await queue("staff", { search: "   " });
    const none = await queue("staff");
    expect(blank.body.pagination).toEqual(none.body.pagination);
    expect(blank.body.appliedQuery.search).toBe("");

    // LIKE wildcards are literal, as in Lab 2.
    expect((await queue("staff", { search: `${TAG} cor%`, status: "ALL" })).body.pagination.totalItems).toBe(0);
  });
});

describe("filters (BR-62)", () => {
  it("API-31 status: ACTIVE, ALL, and each single status give exact sets", async () => {
    const all = await queue("staff", { search: CORE, status: "ALL" });
    expect(all.body.pagination.totalItems).toBe(8);
    const active = await queue("staff", { search: CORE, status: "ACTIVE" });
    expect(new Set(keysOf(active.body.data))).toEqual(new Set(["new-high", "open-medium", "progress-high", "waiting-low", "resolved-medium", "reopened-high"]));
    for (const status of STATUS_ORDER) {
      const res = await queue("staff", { search: CORE, status });
      expect(res.body.data.map((r: Row) => r.currentStatus), status).toEqual([status]);
    }
  });

  it("API-32 IT Priority and Category combine with search and each other (AND)", async () => {
    const high = await queue("staff", { search: CORE, status: "ALL", itPriority: "HIGH" });
    expect(new Set(keysOf(high.body.data))).toEqual(new Set(["new-high", "progress-high", "reopened-high"]));
    const highB = await queue("staff", { search: CORE, status: "ALL", itPriority: "HIGH", categoryId: catB });
    expect(new Set(keysOf(highB.body.data))).toEqual(new Set(["progress-high", "reopened-high"]));
    const highBActive = await queue("staff", { search: "core progress", status: "ACTIVE", itPriority: "HIGH", categoryId: catB });
    expect(keysOf(highBActive.body.data)).toEqual(["progress-high"]);
  });

  it("API-33 owner: any, unassigned, me, and a user id", async () => {
    const q = (owner: string | number, who: Who = "staff") => queue(who, { search: CORE, status: "ALL", owner });
    expect((await q("any")).body.pagination.totalItems).toBe(8);
    expect(new Set(keysOf((await q("unassigned")).body.data))).toEqual(new Set(["new-high", "reopened-high"]));
    expect(new Set(keysOf((await q("me")).body.data))).toEqual(new Set(["open-medium", "waiting-low", "closed-low"]));
    expect(keysOf((await q("me", "staff2")).body.data)).toEqual(["progress-high"]);
    expect(keysOf((await q(users.admin)).body.data)).toEqual(["resolved-medium"]);
    // An inactive owner still owns their ticket (BR-29).
    expect(keysOf((await q(users.inactiveStaff)).body.data)).toEqual(["cancelled-medium"]);
  });

  it("API-34 appearsResolved=true keeps only tickets the Requester flagged", async () => {
    const res = await queue("staff", { search: CORE, status: "ALL", appearsResolved: "true" });
    expect(keysOf(res.body.data)).toEqual(["progress-high"]);
    expect(res.body.appliedQuery.appearsResolved).toBe(true);
  });
});

describe("sorting (BR-63, BR-64)", () => {
  it("API-35 orders by each field in both directions — status by lifecycle, priority LOW < MEDIUM < HIGH", async () => {
    for (const sort of ["itPriority", "createdAt", "updatedAt", "ticketNumber", "status"]) {
      for (const order of ["asc", "desc"] as const) {
        const res = await queue("staff", { search: CORE, status: "ALL", sort, order });
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(8);
        expectOrdered(res.body.data, sort, order);
      }
    }
    // Spot-check the two enum orders explicitly.
    expect(keysOf((await queue("staff", { search: CORE, status: "ALL", sort: "status", order: "asc" })).body.data)).toEqual([
      "new-high", "open-medium", "progress-high", "waiting-low", "resolved-medium", "closed-low", "reopened-high", "cancelled-medium",
    ]);
    expect((await queue("staff", { search: CORE, status: "ALL", sort: "itPriority", order: "asc" })).body.data.map((r: Row) => r.itPriority)).toEqual([
      "LOW", "LOW", "MEDIUM", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "HIGH",
    ]);
    expect(keysOf((await queue("staff", { search: CORE, status: "ALL", sort: "updatedAt", order: "desc" })).body.data).slice(0, 2)).toEqual(["new-high", "resolved-medium"]);
  });

  it("API-36 pages through 25 tickets that tie on every sort value with no repeat and no gap", async () => {
    for (const sort of ["itPriority", "createdAt", "status"]) {
      for (const order of ["asc", "desc"] as const) {
        const seen: number[] = [];
        for (const page of [1, 2, 3]) {
          const res = await queue("staff", { search: BULK, sort, order, page, pageSize: 10 });
          seen.push(...ids(res.body.data));
        }
        expect(seen, `${sort} ${order}`).toHaveLength(25);
        expect(new Set(seen).size, `${sort} ${order}`).toBe(25);
      }
    }
  });
});

describe("invalid values and pages past the end (BR-66, BR-67)", () => {
  it("API-37 answers invalid values with 200 and the defaults, echoed in appliedQuery", async () => {
    const res = await queue("staff", {
      status: "PENDING", itPriority: "URGENT", categoryId: "abc", owner: "nobody", appearsResolved: "maybe",
      sort: "description", order: "up", page: "-2", pageSize: "500",
    });
    expect(res.status).toBe(200);
    expect(res.body.appliedQuery).toEqual({
      search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false,
      sort: "itPriority", order: "desc", page: 1, pageSize: 50,
    });
    const weirdValues: Record<string, string>[] = [{ page: "99999999999999999999999" }, { categoryId: "9999999999" }, { owner: "9999999999" }, { pageSize: "0" }];
    for (const weird of weirdValues) {
      const r = await queue("staff", weird);
      expect(r.status, JSON.stringify(weird)).toBe(200);
    }
  });

  it("API-38 returns an empty page past the last, with correct totals", async () => {
    const res = await queue("staff", { search: BULK, page: 9, pageSize: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 9, pageSize: 10, totalItems: 25, totalPages: 3 });
  });

  it("API-79 rebuilding the URL from appliedQuery reproduces the default order across pages", async () => {
    const first = await queue("staff");
    const rebuilt = Object.fromEntries(
      Object.entries(first.body.appliedQuery as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== "" && v !== false)
        .map(([k, v]) => [k, String(v)]),
    );
    const pages: number[][] = [];
    for (const page of [1, 2, 3]) {
      const a = await queue("staff", { page });
      const b = await queue("staff", { ...rebuilt, page });
      expect(ids(b.body.data), `page ${page}`).toEqual(ids(a.body.data));
      pages.push(ids(b.body.data));
    }
    expect(pages[0]).toEqual(ids(first.body.data));
    const flat = pages.flat();
    expect(flat.length).toBe(Math.min(30, first.body.pagination.totalItems));
    expect(new Set(flat).size).toBe(flat.length);
  });
});

describe("who may see the queue, and what a row carries", () => {
  it("API-39 Administrators get 200; Requesters get 403 with no ticket data", async () => {
    const admin = await queue("admin", { search: CORE });
    expect(admin.status).toBe(200);
    expect(admin.body.data).toHaveLength(6);
    const requester = await queue("requester", { search: CORE });
    expect(requester.status).toBe(403);
    expect(requester.body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
    expect(requester.text).not.toContain(TAG);
  });

  it("API-40 a row has the Requester, Category, both priorities, status, owner with isActive, the signal, and dates — no description or notes", async () => {
    const res = await queue("staff", { search: "core progress" });
    const [row] = res.body.data;
    expect(Object.keys(row).sort()).toEqual(
      ["category", "createdAt", "currentStatus", "id", "itPriority", "owner", "requestedPriority", "requester", "requesterResolvedAt", "summary", "ticketNumber", "updatedAt"].sort(),
    );
    expect(row.requester).toEqual({ id: users.otherRequester, name: `Beta Requester ${TAG}`, role: "REQUESTER", isActive: true });
    expect(row.category).toEqual({ id: catB, name: expect.any(String) });
    expect(row.owner).toEqual({ id: users.staff2, name: `Queue Staff Two ${stamp}`, role: "IT_STAFF", isActive: true });
    expect(row.requesterResolvedAt).toBe("2026-09-30T00:00:00.000Z");
    expect(res.text).not.toMatch(/description|Queue suite fixture|internalNote|noteCount/i);

    const inactive = await queue("staff", { search: "core cancelled", status: "ALL" });
    expect(inactive.body.data[0].owner).toEqual({ id: users.inactiveStaff, name: `Queue Inactive ${stamp}`, role: "IT_STAFF", isActive: false });
    expect((await queue("staff", { search: "core new-high" })).body.data[0].owner).toBeNull();
  });
});

describe("GET /api/staff/assignable-users (api-spec §5.3)", () => {
  it("API-59 lists active IT Staff and Administrators by name for both staff roles; Requesters get 403", async () => {
    for (const who of ["staff", "admin"] as const) {
      const res = await request(app).get("/api/staff/assignable-users").set("Cookie", cookies[who]);
      expect(res.status, who).toBe(200);
      const people = res.body.data as { id: number; name: string; role: Role; isActive: boolean }[];
      expect(people.map((p) => p.id)).toEqual(expect.arrayContaining([users.staff, users.staff2, users.admin]));
      expect(people.map((p) => p.id)).not.toContain(users.inactiveStaff);
      expect(people.map((p) => p.id)).not.toContain(users.requester);
      for (const p of people) {
        expect(Object.keys(p).sort()).toEqual(["id", "isActive", "name", "role"]);
        expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(p.role);
        expect(p.isActive).toBe(true);
      }
      const names = people.map((p) => p.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
    const refused = await request(app).get("/api/staff/assignable-users").set("Cookie", cookies.requester);
    expect(refused.status).toBe(403);
    expect(refused.text).not.toContain(`Queue Staff ${stamp}`);
  });
});
