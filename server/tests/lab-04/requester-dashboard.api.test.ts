import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// DASH-01 to DASH-03, DASH-10 — the Requester Dashboard
// (docs/lab-04/specification.md BR-36, BR-37, BR-40; api-spec §3.1).
//
// Each Requester here is created by this file, so "own tickets" are exactly the
// ones made below; every value is still compared with a SQL count, never a
// number written into the test.

const prisma = getPrisma();
const stamp = Date.now();
const DAY = 24 * 3600_000;
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const UNRESOLVED: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

type Who = "alice" | "bob" | "staff" | "admin";
const users = {} as Record<Who, number>;
const cookies = {} as Record<Who, string>;
const ticketIds: number[] = [];

async function makeTicket(requester: number, status: TicketStatus, over: { updatedAt?: Date; resolvedAt?: Date | null } = {}) {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const n = ticketIds.length;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `RDB-${stamp}-${n}`, requesterId: requester, ownerId: status === "NEW" ? null : users.staff, categoryId: category.id, relatedSystemId: system.id,
      summary: `Requester dashboard ${n}`, description: "Created by the Lab 4 Requester dashboard suite.", itPriority: "HIGH", requestedPriority: "LOW",
      currentStatus: status, createdAt: new Date(Date.now() - 20 * DAY),
      resolvedAt: over.resolvedAt !== undefined ? over.resolvedAt : status === "RESOLVED" || status === "CLOSED" ? new Date(Date.now() - 2 * DAY) : null,
    },
  });
  // updatedAt is set by Prisma on write; set it explicitly where a test needs an order.
  // Sent as UTC text and cast, so the stored value is the same whatever time zone the database runs in.
  if (over.updatedAt) await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${over.updatedAt.toISOString()}::timestamp WHERE id = ${t.id}`;
  ticketIds.push(t.id);
  return t.id;
}

const dashboard = (who: Who, query = "") => request(app).get(`/api/dashboard/requester${query}`).set("Cookie", cookies[who]);
const metric = (body: { metrics: { key: string; value: number; href: string }[] }, key: string) => body.metrics.find((m) => m.key === key)!;
async function sqlCount(requester: number, statuses: TicketStatus[]) {
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = ${requester} AND "currentStatus"::text = ANY(${statuses})`;
  return Number(n);
}

beforeAll(async () => {
  const make = async (key: Who, role: Role) => {
    const u = await prisma.user.create({ data: { name: `RDB ${key} ${stamp}`, email: `rdb.${key}.${stamp}@kmutt.ac.th`, role, mustChangePassword: false } });
    users[key] = u.id;
    cookies[key] = await sessionCookieFor(prisma, u.id);
  };
  await make("alice", "REQUESTER");
  await make("bob", "REQUESTER");
  await make("staff", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
  // Alice: two of every status; Bob: one of every status, so a leak shows up as a wrong count.
  for (const status of ALL) {
    await makeTicket(users.alice, status);
    await makeTicket(users.alice, status);
    await makeTicket(users.bob, status);
  }
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

describe("DASH-01 only the signed-in Requester's tickets (BR-36, AC-18)", () => {
  it("counts and lists only their own tickets, ignores a requesterId in the query, and never carries IT Priority", async () => {
    const alice = await dashboard("alice");
    const sneaky = await dashboard("alice", `?requesterId=${users.bob}`);
    expect(alice.status).toBe(200);
    expect(sneaky.body.metrics).toEqual(alice.body.metrics);
    const aliceTickets = new Set((await prisma.ticket.findMany({ where: { requesterId: users.alice }, select: { id: true } })).map((t) => t.id));
    for (const list of Object.values(alice.body.lists) as { id: number }[][]) for (const item of list) expect(aliceTickets.has(item.id)).toBe(true);
    expect(alice.text).not.toMatch(/itPriority/);
    expect(alice.text).not.toMatch(/"HIGH"/);
    const bob = await dashboard("bob");
    expect(metric(bob.body, "unresolved").value).toBe(await sqlCount(users.bob, UNRESOLVED));
    expect(metric(bob.body, "unresolved").value).not.toBe(metric(alice.body, "unresolved").value);
  });
});

describe("DASH-02 the metrics against SQL (BR-40, AC-19)", () => {
  it("returns each BR-40 metric, in order, with its count and drill-down", async () => {
    const { body } = await dashboard("alice");
    expect(body.timeZone).toBe("Asia/Bangkok");
    expect(Date.parse(body.generatedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(body.metrics.map((m: { key: string }) => m.key)).toEqual(["unresolved", "waitingForMe", "resolved", "closed"]);
    expect(metric(body, "unresolved")).toEqual({ key: "unresolved", label: "Open requests", value: await sqlCount(users.alice, UNRESOLVED), href: "/tickets?status=UNRESOLVED" });
    expect(metric(body, "waitingForMe")).toEqual({ key: "waitingForMe", label: "Waiting for you", value: await sqlCount(users.alice, ["WAITING_FOR_REQUESTER"]), href: "/tickets?status=WAITING_FOR_REQUESTER" });
    expect(metric(body, "resolved")).toEqual({ key: "resolved", label: "Resolved", value: await sqlCount(users.alice, ["RESOLVED"]), href: "/tickets?status=RESOLVED" });
    expect(metric(body, "closed")).toEqual({ key: "closed", label: "Closed", value: await sqlCount(users.alice, ["CLOSED"]), href: "/tickets?status=CLOSED" });
    for (const m of body.metrics) expect(Number.isInteger(m.value) && m.value >= 0).toBe(true);
  });
});

describe("DASH-03 the lists: content, order, and limit (BR-37, BR-40)", () => {
  it("holds at most 5 of each, newest first, and only resolved work from the last 7 days", async () => {
    const carol = await prisma.user.create({ data: { name: `RDB carol ${stamp}`, email: `rdb.carol.${stamp}@kmutt.ac.th`, role: "REQUESTER", mustChangePassword: false } });
    const cookie = await sessionCookieFor(prisma, carol.id);
    try {
      const now = Date.now();
      const waiting: number[] = [];
      for (let i = 0; i < 7; i++) waiting.push(await makeTicket(carol.id, "WAITING_FOR_REQUESTER", { updatedAt: new Date(now - (i + 1) * 3600_000) }));
      // The newest change of all is on a ticket that is not waiting for her.
      const newest = await makeTicket(carol.id, "IN_PROGRESS", { updatedAt: new Date(now - 60_000) });
      // Two tickets updated at the same moment: the higher id comes first (PR #78 review).
      const tieAt = new Date(now - 30_000);
      const tieLow = await makeTicket(carol.id, "OPEN", { updatedAt: tieAt });
      const tieHigh = await makeTicket(carol.id, "OPEN", { updatedAt: tieAt });
      // Three resolved within the 7-day window, one just outside it.
      const resolved: number[] = [];
      for (let i = 0; i < 3; i++) resolved.push(await makeTicket(carol.id, i % 2 ? "CLOSED" : "RESOLVED", { resolvedAt: new Date(now - (i + 1) * 24 * 3600_000), updatedAt: new Date(now - 10 * DAY) }));
      await makeTicket(carol.id, "RESOLVED", { resolvedAt: new Date(now - 7 * DAY - 3600_000), updatedAt: new Date(now - 10 * DAY) });

      const { body } = await request(app).get("/api/dashboard/requester").set("Cookie", cookie);
      const ids = (key: string) => body.lists[key].map((t: { id: number }) => t.id);
      expect(ids("needsAttention")).toEqual(waiting.slice(0, 5));
      expect(ids("recentlyUpdated")).toEqual([tieHigh, tieLow, newest, ...waiting.slice(0, 2)]);
      expect(ids("recentlyResolved")).toEqual(resolved);
      expect(body.lists.recentlyResolved[0]).toEqual({
        id: resolved[0], ticketNumber: expect.stringMatching(/^RDB-/), summary: expect.any(String), currentStatus: "RESOLVED",
        updatedAt: expect.any(String), resolvedAt: expect.any(String), href: `/tickets/${resolved[0]}`,
      });
      expect(Object.keys(body.lists.needsAttention[0]).sort()).toEqual(["currentStatus", "href", "id", "summary", "ticketNumber", "updatedAt"]);
    } finally {
      await prisma.session.deleteMany({ where: { userId: carol.id } });
      await prisma.ticket.deleteMany({ where: { requesterId: carol.id } });
      await prisma.user.delete({ where: { id: carol.id } });
    }
  });
});

describe("DASH-10 the right role only (BR-15, AC-24)", () => {
  it("refuses IT Staff and Administrators on the Requester endpoint, others on theirs, and anyone without a session", async () => {
    for (const [path, denied] of [["/api/dashboard/requester", ["staff", "admin"]], ["/api/dashboard/staff", ["alice", "admin"]], ["/api/dashboard/admin", ["alice", "staff"]]] as const) {
      for (const who of denied) {
        const res = await request(app).get(path).set("Cookie", cookies[who]);
        expect(res.status, `${who} ${path}`).toBe(403);
        expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
      }
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });
});
