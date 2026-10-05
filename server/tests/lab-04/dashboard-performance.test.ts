import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// Performance smoke (docs/lab-04/specification.md D-17). PERF-03 covers the
// Actions Taken list; PERF-01 and PERF-02 (the dashboards) join this file in Issue 5.
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
      ticketNumber: `PERF-${stamp}-${n}`, requesterId: requester, categoryId: category.id, relatedSystemId: system.id,
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
