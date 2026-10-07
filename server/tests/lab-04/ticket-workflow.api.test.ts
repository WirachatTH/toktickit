import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// WF-01 to WF-11 — the final transition matrix and the resolution gate
// (docs/lab-04/specification.md BR-27 to BR-32, api-spec.md §2).
//
// Every user, ticket, and action here is created by this file and removed afterwards.

const prisma = getPrisma();
const stamp = Date.now();
const HOUR = 3600_000;
const SUMMARY = "Replaced the faulty battery; it now holds charge all day.";
const REASON = "Reopened: the battery is draining again.";

const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
// BR-27 — the table, written out here from the spec, not imported.
const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
};

type Who = "requester" | "staff" | "staff2" | "admin";
const users = {} as Record<Who, number>;
const cookies = {} as Record<Who, string>;
const ticketIds: number[] = [];
let category: number;
let system: number;

async function makeTicket(status: TicketStatus, owner: number | null = users.staff) {
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `WF-${stamp}-${ticketIds.length}`, requesterId: users.requester, ownerId: owner, categoryId: category, relatedSystemId: system,
      summary: "Workflow fixture", description: "Created by the Lab 4 workflow suite.", itPriority: "MEDIUM", currentStatus: status,
      resolutionSummary: status === "RESOLVED" || status === "CLOSED" ? SUMMARY : null, createdAt: new Date(Date.now() - 5 * 24 * HOUR),
    },
  });
  ticketIds.push(t.id);
  return t.id;
}

// Actions written directly, so a test can build any state, including on tickets the API would refuse.
async function addAction(ticketId: number, status: "PLANNED" | "COMPLETED" | "CANCELLED", extra: { followUpRequired?: boolean; followUpOfId?: number } = {}) {
  const done = status === "COMPLETED";
  const a = await prisma.actionTaken.create({
    data: {
      ticketId, actionAt: new Date(Date.now() - HOUR), description: `${status} action`, status, assigneeId: users.staff, createdById: users.staff,
      result: done ? "Done." : null, performedById: done ? users.staff : null, completedAt: done ? new Date() : null,
      cancelReason: status === "CANCELLED" ? "Not needed after all." : null,
      followUpRequired: extra.followUpRequired ?? false, followUpNote: extra.followUpRequired ? "Check again." : null, followUpOfId: extra.followUpOfId ?? null,
    },
  });
  return a.id;
}

const textFor = (to: TicketStatus) => (to === "RESOLVED" ? { resolutionSummary: SUMMARY } : to === "CANCELLED" || to === "REOPENED" ? { reason: REASON } : {});
function move(id: number, to: TicketStatus, from: TicketStatus, ownerId: number | null = users.staff, who: Who = "staff") {
  return request(app).patch(`/api/staff/tickets/${id}/status`).set("Cookie", cookies[who]).send({ status: to, expectedStatus: from, expectedOwnerId: ownerId, ...textFor(to) });
}
const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  category = (await prisma.category.findFirstOrThrow()).id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const make = async (key: Who, role: Role) => {
    const u = await prisma.user.create({ data: { name: `WF ${key} ${stamp}`, email: `wf.${key}.${stamp}@kmutt.ac.th`, role, mustChangePassword: false } });
    users[key] = u.id;
    cookies[key] = await sessionCookieFor(prisma, u.id);
  };
  await make("requester", "REQUESTER");
  await make("staff", "IT_STAFF");
  await make("staff2", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

describe("WF-01 the final transition matrix (BR-27)", () => {
  it("allows exactly the matrix pairs when the gate is satisfied, and refuses every other pair", async () => {
    let allowed = 0;
    for (const from of ALL) {
      for (const to of ALL) {
        const id = await makeTicket(from);
        await addAction(id, "COMPLETED");
        const res = await move(id, to, from);
        const label = `${from} -> ${to}`;
        if (MATRIX[from].includes(to)) {
          expect(res.status, label).toBe(200);
          expect((await row(id)).currentStatus, label).toBe(to);
          allowed++;
        } else {
          expect(res.status, label).toBe(409);
          expect(res.body.error.code, label).toBe("INVALID_TRANSITION");
          expect((await row(id)).currentStatus, label).toBe(from);
        }
      }
    }
    expect(allowed).toBe(17);
  });
});

describe("the resolution gate (BR-28)", () => {
  it("WF-02 refuses a ticket with no completed action, including one with only cancelled actions", async () => {
    for (const setup of [async (_id: number) => undefined, async (id: number) => { await addAction(id, "CANCELLED"); await addAction(id, "CANCELLED"); }]) {
      const id = await makeTicket("IN_PROGRESS");
      await setup(id);
      const res = await move(id, "RESOLVED", "IN_PROGRESS");
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: "RESOLUTION_BLOCKED", details: { completedCount: 0, plannedCount: 0, openFollowUpCount: 0 } });
      expect(res.body.error.message).toEqual(expect.any(String));
      const t = await row(id);
      expect([t.currentStatus, t.resolutionSummary, t.resolvedAt]).toEqual(["IN_PROGRESS", null, null]);
    }
  });

  it("WF-03 refuses while an action is planned, then allows it once the action is completed", async () => {
    const id = await makeTicket("IN_PROGRESS");
    await addAction(id, "COMPLETED");
    const planned = await addAction(id, "PLANNED");
    const blocked = await move(id, "RESOLVED", "IN_PROGRESS");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "RESOLUTION_BLOCKED", details: { completedCount: 1, plannedCount: 1, openFollowUpCount: 0 } });

    const done = await request(app).patch(`/api/tickets/${id}/actions-taken/${planned}/status`).set("Cookie", cookies.staff).send({ status: "COMPLETED", expectedVersion: 1, result: "Finished the remaining work." });
    expect(done.status).toBe(200);
    const before = Date.now();
    const res = await move(id, "RESOLVED", "IN_PROGRESS");
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("RESOLVED");
    expect((await row(id)).resolvedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("WF-04 refuses while a follow-up is open, and allows it once a completed follow-up links to it", async () => {
    const id = await makeTicket("WAITING_FOR_REQUESTER");
    const needs = await addAction(id, "COMPLETED", { followUpRequired: true });
    const blocked = await move(id, "RESOLVED", "WAITING_FOR_REQUESTER");
    expect(blocked.body.error).toMatchObject({ code: "RESOLUTION_BLOCKED", details: { completedCount: 1, plannedCount: 0, openFollowUpCount: 1 } });
    await addAction(id, "COMPLETED", { followUpOfId: needs });
    expect((await move(id, "RESOLVED", "WAITING_FOR_REQUESTER")).status).toBe(200);
  });

  it("WF-05 reports the earlier conflicts first: STALE_STATE, INVALID_TRANSITION, and OWNER_REQUIRED win over the gate", async () => {
    const stale = await makeTicket("IN_PROGRESS");
    expect((await move(stale, "RESOLVED", "OPEN")).body.error.code).toBe("STALE_STATE");
    const closed = await makeTicket("CLOSED");
    expect((await move(closed, "RESOLVED", "CLOSED")).body.error.code).toBe("INVALID_TRANSITION");
    const ownerless = await makeTicket("OPEN", null);
    expect((await move(ownerless, "RESOLVED", "OPEN", null)).body.error.code).toBe("OWNER_REQUIRED");
    // And validation comes before all of them (Lab 3 BR-22): a short summary is 400.
    const res = await request(app).patch(`/api/staff/tickets/${stale}/status`).set("Cookie", cookies.staff).send({ status: "RESOLVED", expectedStatus: "IN_PROGRESS", expectedOwnerId: users.staff, resolutionSummary: "short" });
    expect(res.status).toBe(400);
  });

  it("WF-06 never resolves a ticket that still has planned work, under racing requests (20 runs each)", async () => {
    for (let run = 0; run < 20; run++) {
      // Completing the last planned action races resolving the ticket.
      const a = await makeTicket("IN_PROGRESS");
      await addAction(a, "COMPLETED");
      const planned = await addAction(a, "PLANNED");
      const [complete, resolve] = await Promise.all([
        request(app).patch(`/api/tickets/${a}/actions-taken/${planned}/status`).set("Cookie", cookies.staff2).send({ status: "COMPLETED", expectedVersion: 1, result: "Done in the race." }),
        move(a, "RESOLVED", "IN_PROGRESS"),
      ]);
      expect(complete.status, `run ${run}`).toBe(200);
      expect([200, 409], `run ${run}`).toContain(resolve.status);
      if (resolve.status === 409) expect(resolve.body.error.code).toBe("RESOLUTION_BLOCKED");

      // Adding planned work races resolving a ticket that is ready.
      const b = await makeTicket("IN_PROGRESS");
      await addAction(b, "COMPLETED");
      const [add, resolveB] = await Promise.all([
        request(app).post(`/api/tickets/${b}/actions-taken`).set("Cookie", cookies.staff2).send({ status: "PLANNED", actionAt: new Date(Date.now() + HOUR).toISOString(), description: "One more check.", assigneeId: users.staff2 }),
        move(b, "RESOLVED", "IN_PROGRESS"),
      ]);
      // Exactly one of them wins; the loser is refused with its own conflict.
      expect([add.status, resolveB.status].sort(), `run ${run}`).toEqual([201, 409]);
      if (add.status === 409) expect(add.body.error.code).toBe("TICKET_RESOLVED");
      else expect(resolveB.body.error.code).toBe("RESOLUTION_BLOCKED");

      for (const id of [a, b]) {
        const t = await row(id);
        const plannedLeft = await prisma.actionTaken.count({ where: { ticketId: id, status: "PLANNED" } });
        if (t.currentStatus === "RESOLVED") expect(plannedLeft, `run ${run} ticket ${id}`).toBe(0);
      }
    }
  });
});

describe("what IT Staff Ticket Detail reports (BR-30)", () => {
  it("WF-07 leaves Resolved out of the permitted transitions while the gate fails, and reports the gate to both roles", async () => {
    const id = await makeTicket("IN_PROGRESS");
    const planned = await addAction(id, "PLANNED");
    const detail = (who: Who) => request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookies[who]);

    const failing = (await detail("staff")).body;
    expect(failing.permittedTransitions).toEqual(["WAITING_FOR_REQUESTER", "CANCELLED"]);
    expect(failing.resolutionGate).toEqual({ passes: false, completedCount: 0, plannedCount: 1, openFollowUpCount: 0 });
    expect(failing.resolvedAt).toBeNull();

    await prisma.actionTaken.update({ where: { id: planned }, data: { status: "COMPLETED", result: "Done.", performedById: users.staff, completedAt: new Date() } });
    const passing = (await detail("staff")).body;
    expect(passing.permittedTransitions).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(passing.resolutionGate).toEqual({ passes: true, completedCount: 1, plannedCount: 0, openFollowUpCount: 0 });

    const admin = (await detail("admin")).body;
    expect(admin.permittedTransitions).toEqual([]);
    expect(admin.resolutionGate).toEqual(passing.resolutionGate);
  });
});

describe("status side effects (BR-31, BR-32, BR-05)", () => {
  it("WF-08 sets resolvedAt on Resolved, clears it on Reopened, and keeps it on Closed; the Requester sees it", async () => {
    const id = await makeTicket("IN_PROGRESS");
    await addAction(id, "COMPLETED");
    expect((await move(id, "RESOLVED", "IN_PROGRESS")).status).toBe(200);
    const first = (await row(id)).resolvedAt;
    expect(first).not.toBeNull();
    const mine = await request(app).get(`/api/tickets/${id}`).set("Cookie", cookies.requester);
    expect(mine.body.resolvedAt).toBe(first!.toISOString());

    expect((await move(id, "REOPENED", "RESOLVED")).status).toBe(200);
    expect((await row(id)).resolvedAt).toBeNull();
    expect((await move(id, "RESOLVED", "REOPENED")).status).toBe(200);
    const second = (await row(id)).resolvedAt!;
    expect(second.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    expect((await move(id, "CLOSED", "RESOLVED")).status).toBe(200);
    expect((await row(id)).resolvedAt).toEqual(second);
    // Other moves never touch it.
    const other = await makeTicket("OPEN");
    expect((await move(other, "IN_PROGRESS", "OPEN")).status).toBe(200);
    expect((await row(other)).resolvedAt).toBeNull();
  });

  it("WF-09 the Requester's 'appears resolved' neither changes the status nor satisfies the gate", async () => {
    const id = await makeTicket("IN_PROGRESS");
    const mark = await request(app).post(`/api/tickets/${id}/appears-resolved`).set("Cookie", cookies.requester).send({});
    expect(mark.status).toBe(200);
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
    const res = await move(id, "RESOLVED", "IN_PROGRESS");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_BLOCKED");
  });

  it("WF-10 after a reopen, the work completed earlier still satisfies the gate (D-14)", async () => {
    const id = await makeTicket("RESOLVED");
    await addAction(id, "COMPLETED");
    expect((await move(id, "REOPENED", "RESOLVED")).status).toBe(200);
    expect((await move(id, "RESOLVED", "REOPENED")).status).toBe(200);
  });

  it("WF-11 only IT Staff change status: Requesters and Administrators are refused (Lab 3 BR-39, BR-17)", async () => {
    const id = await makeTicket("IN_PROGRESS");
    await addAction(id, "COMPLETED");
    for (const who of ["requester", "admin"] as const) {
      const res = await move(id, "RESOLVED", "IN_PROGRESS", users.staff, who);
      expect(res.status, who).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
  });
});
