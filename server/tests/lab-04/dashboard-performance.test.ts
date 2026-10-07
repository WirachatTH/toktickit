import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// Performance smoke (docs/lab-04/specification.md D-17, AC-25): PERF-01 and
// PERF-02 for the three dashboards, PERF-03 for the Actions Taken list.
//
// Prisma operations are counted with a client middleware on the shared client,
// so the count includes every query the handler makes. Vitest gives each test
// file its own module instance, so the middleware never leaves this file.

const prisma = getPrisma();
const stamp = Date.now();
let operations = 0;
prisma.$use(async (params, next) => {
  operations += 1;
  return next(params);
});

let staff: number;
let requester: number;
let cookie: string;
const ticketIds: number[] = [];

async function ticketWithActions(n: number) {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `PERF-${stamp}-${ticketIds.length}`, requesterId: requester, categoryId: category.id, relatedSystemId: system.id,
      summary: "Performance fixture", description: "Created by the Lab 4 performance smoke.", itPriority: "LOW", currentStatus: "IN_PROGRESS",
    },
  });
  ticketIds.push(ticket.id);
  const first = await prisma.actionTaken.create({
    data: { ticketId: ticket.id, actionAt: new Date(), description: "Needs a follow-up", status: "COMPLETED", result: "Done", followUpRequired: true, followUpNote: "Check", assigneeId: staff, createdById: staff, performedById: staff, completedAt: new Date() },
  });
  for (let i = 1; i < n; i += 1) {
    await prisma.actionTaken.create({
      data: { ticketId: ticket.id, actionAt: new Date(Date.now() - i * 60_000), description: `Step ${i}`, assigneeId: staff, createdById: staff, followUpOfId: i % 2 ? first.id : null },
    });
  }
  return ticket.id;
}

beforeAll(async () => {
  staff = (await prisma.user.create({ data: { name: `Perf staff ${stamp}`, email: `perf.staff.${stamp}@kmutt.ac.th`, role: "IT_STAFF", mustChangePassword: false } })).id;
  requester = (await prisma.user.create({ data: { name: `Perf req ${stamp}`, email: `perf.req.${stamp}@kmutt.ac.th`, role: "REQUESTER", mustChangePassword: false } })).id;
  cookie = await sessionCookieFor(prisma, staff);
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [staff, requester] } } });
});

describe("PERF-03 the Actions Taken list", () => {
  it("answers a 30-action ticket within 500 ms, with the same number of queries as a 3-action ticket", async () => {
    const small = await ticketWithActions(3);
    const large = await ticketWithActions(30);

    const measure = async (ticketId: number) => {
      operations = 0;
      const started = performance.now();
      const res = await request(app).get(`/api/tickets/${ticketId}/actions-taken`).set("Cookie", cookie);
      const ms = performance.now() - started;
      expect(res.status).toBe(200);
      return { ms, ops: operations, rows: res.body.data.length };
    };

    await measure(small); // warm-up: the first request pays for connecting
    const a = await measure(small);
    const b = await measure(large);
    expect([a.rows, b.rows]).toEqual([3, 30]);
    expect(b.ops).toBe(a.ops);
    expect(b.ms).toBeLessThan(500);
  });
});

describe("the dashboards (D-17, AC-25)", () => {
  const ENDPOINTS = ["/api/dashboard/requester", "/api/dashboard/staff", "/api/dashboard/admin"] as const;
  const roles = { "/api/dashboard/requester": "REQUESTER", "/api/dashboard/staff": "IT_STAFF", "/api/dashboard/admin": "ADMINISTRATOR" } as const;
  const cookieFor: Record<string, string> = {};
  const extraUsers: number[] = [];

  beforeAll(async () => {
    for (const path of ENDPOINTS) {
      const role = roles[path];
      const u = role === "REQUESTER"
        ? requester
        : role === "IT_STAFF"
          ? staff
          : (await prisma.user.create({ data: { name: `Perf admin ${stamp}`, email: `perf.admin.${stamp}@kmutt.ac.th`, role, mustChangePassword: false } })).id;
      if (role === "ADMINISTRATOR") extraUsers.push(u);
      cookieFor[path] = await sessionCookieFor(prisma, u);
    }
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: extraUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
  });

  it("PERF-01 each answers 20 sequential calls with a 95th percentile under 500 ms, and no list longer than 5", async () => {
    for (const path of ENDPOINTS) {
      await request(app).get(path).set("Cookie", cookieFor[path]); // warm-up
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const started = performance.now();
        const res = await request(app).get(path).set("Cookie", cookieFor[path]);
        times.push(performance.now() - started);
        expect(res.status, path).toBe(200);
        for (const [key, list] of Object.entries(res.body.lists as Record<string, unknown[]>)) expect(list.length, `${path} ${key}`).toBeLessThanOrEqual(5);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(0.95 * times.length) - 1];
      expect(p95, `${path} p95 ${p95.toFixed(0)} ms`).toBeLessThan(500);
    }
  });

  it("PERF-02 runs the same number of queries before and after 50 more tickets with actions", async () => {
    const measure = async (path: (typeof ENDPOINTS)[number]) => {
      operations = 0;
      const res = await request(app).get(path).set("Cookie", cookieFor[path]);
      expect(res.status).toBe(200);
      return operations;
    };
    // One at a time: the counter is shared.
    const before: [(typeof ENDPOINTS)[number], number][] = [];
    for (const p of ENDPOINTS) before.push([p, await measure(p)]);
    for (let i = 0; i < 50; i++) {
      const id = await ticketWithActions(2);
      await prisma.ticket.update({ where: { id }, data: { ownerId: staff } });
    }
    for (const [path, ops] of before) expect(await measure(path), path).toBe(ops);
  });
});
