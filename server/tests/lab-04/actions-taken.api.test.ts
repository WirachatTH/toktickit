import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// API-01 to API-22 — Actions Taken (docs/lab-04/api-spec.md §1,
// specification.md BR-01 to BR-26, BR-43).
//
// Every user, ticket, and action here is created by this file and removed
// afterwards (Lab 3 D-22); actions and their events cascade with their tickets.

const prisma = getPrisma();
const stamp = Date.now();
const HOUR = 60 * 60 * 1000;

type Who = "requester" | "other" | "staff" | "staff2" | "admin" | "inactiveStaff" | "inactiveAdmin";
const users = {} as Record<Who, { id: number; name: string; role: Role }>;
const cookies = {} as Record<Who, string>;
const ticketIds: number[] = [];
let category: number;
let system: number;

// Tickets are created ten days ago, so any recent past time is a valid actionAt.
async function makeTicket(status: TicketStatus = "IN_PROGRESS", requester: Who = "requester") {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `ACT-${stamp}-${ticketIds.length}`,
      requesterId: users[requester].id,
      ownerId: status === "NEW" ? null : users.staff.id,
      categoryId: category,
      relatedSystemId: system,
      summary: "Actions Taken fixture",
      description: "Created by the Lab 4 Actions Taken suite.",
      itPriority: "MEDIUM",
      currentStatus: status,
      createdAt: new Date(Date.now() - 10 * 24 * HOUR),
    },
  });
  ticketIds.push(ticket.id);
  return ticket.id;
}

const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();
const base = (t: number) => `/api/tickets/${t}/actions-taken`;
const list = (t: number, who: Who) => request(app).get(base(t)).set("Cookie", cookies[who]);
const create = (t: number, who: Who, body: object) => request(app).post(base(t)).set("Cookie", cookies[who]).send(body);
const edit = (t: number, a: number, who: Who, body: object) => request(app).patch(`${base(t)}/${a}`).set("Cookie", cookies[who]).send(body);
const setStatus = (t: number, a: number, who: Who, body: object) => request(app).patch(`${base(t)}/${a}/status`).set("Cookie", cookies[who]).send(body);
const history = (t: number, a: number, who: Who) => request(app).get(`${base(t)}/${a}/history`).set("Cookie", cookies[who]);
const person = (who: Who, isActive = true) => ({ id: users[who].id, name: users[who].name, role: users[who].role, isActive });

const planned = (overrides: object = {}) => ({ status: "PLANNED", actionAt: iso(24), description: "Replace the laptop battery.", assigneeId: users.staff.id, ...overrides });
const completed = (overrides: object = {}) => ({ status: "COMPLETED", actionAt: iso(-2), description: "Replaced the laptop battery.", result: "Holds charge for 6 hours.", assigneeId: users.staff.id, ...overrides });

const ACTION_KEYS = [
  "actionAt", "assignee", "attachmentNotes", "cancelReason", "cancelledAt", "cancelledBy", "completedAt", "createdAt", "createdBy",
  "description", "followUpHandled", "followUpNote", "followUpOfId", "followUpRequired", "id", "performedBy", "result", "status",
  "ticketId", "updatedAt", "version",
];

async function events(actionId: number) {
  return prisma.actionTakenEvent.findMany({ where: { actionTakenId: actionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

beforeAll(async () => {
  category = (await prisma.category.findFirstOrThrow()).id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const make = async (key: Who, role: Role, isActive = true) => {
    const name = `Actions ${key} ${stamp}`;
    const user = await prisma.user.create({ data: { name, email: `actions.${key.toLowerCase()}.${stamp}@kmutt.ac.th`, role, isActive, mustChangePassword: false } });
    users[key] = { id: user.id, name, role };
    if (isActive) cookies[key] = await sessionCookieFor(prisma, user.id);
  };
  await make("requester", "REQUESTER");
  await make("other", "REQUESTER");
  await make("staff", "IT_STAFF");
  await make("staff2", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
  await make("inactiveStaff", "IT_STAFF", false);
  await make("inactiveAdmin", "ADMINISTRATOR", false);
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
});

describe("listing and order (BR-24)", () => {
  it("API-01 lists every field in actionAt-then-id order, the same on every read", async () => {
    const t = await makeTicket();
    const later = (await create(t, "staff", planned({ actionAt: iso(1) }))).body.id;
    const first = (await create(t, "staff", completed({ actionAt: "2026-10-01T10:00:00.000Z" }))).body.id;
    const sameTime = (await create(t, "staff", completed({ actionAt: "2026-10-01T10:00:00.000Z" }))).body.id;
    const reads = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await list(t, "staff");
      expect(res.status).toBe(200);
      reads.push(res.body.data.map((a: { id: number }) => a.id));
      for (const a of res.body.data) expect(Object.keys(a).sort()).toEqual(ACTION_KEYS);
    }
    expect(reads).toEqual([[first, sameTime, later], [first, sameTime, later], [first, sameTime, later]]);
    // An action is reached only through its own ticket.
    const elsewhere = await makeTicket();
    expect((await edit(elsewhere, first, "staff", { expectedVersion: 1, description: "x" })).status).toBe(404);
    expect((await history(elsewhere, first, "staff")).status).toBe(404);
    expect((await list(2_000_000_000, "staff")).status).toBe(404);
  });

  it("API-02 moves an action whose date is edited, and keeps every other relative order", async () => {
    const t = await makeTicket();
    const ids = [];
    for (const h of [-5, -4, -3]) ids.push((await create(t, "staff", planned({ actionAt: iso(h) }))).body.id);
    const res = await edit(t, ids[2], "staff", { expectedVersion: 1, actionAt: iso(-6) });
    expect(res.status).toBe(200);
    expect((await list(t, "staff")).body.data.map((a: { id: number }) => a.id)).toEqual([ids[2], ids[0], ids[1]]);
  });
});

describe("creating (BR-01 to BR-11)", () => {
  it("API-03 IT Staff plan an action for a colleague: saved under the ticket with the server's creator", async () => {
    const t = await makeTicket();
    const before = (await prisma.ticket.findUniqueOrThrow({ where: { id: t } })).updatedAt;
    const res = await create(t, "staff", planned({ assigneeId: users.staff2.id, attachmentNotes: "  photo-1.jpg on this ticket  " }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: t,
      status: "PLANNED",
      description: "Replace the laptop battery.",
      assignee: person("staff2"),
      createdBy: person("staff"),
      performedBy: null,
      result: null,
      followUpRequired: false,
      followUpNote: null,
      followUpHandled: null,
      attachmentNotes: "photo-1.jpg on this ticket",
      version: 1,
      completedAt: null,
    });
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.ticketId).toBe(t);
    const log = await events(res.body.id);
    expect(log.map((e) => [e.type, e.actorId])).toEqual([["CREATED", users.staff.id]]);
    expect((log[0].changes as Record<string, { from: unknown; to: unknown }>).description).toEqual({ from: null, to: "Replace the laptop battery." });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t } })).updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("API-04 records work already done: Performed by is the caller", async () => {
    const t = await makeTicket();
    const res = await create(t, "staff2", completed({ assigneeId: users.staff.id }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "COMPLETED", performedBy: person("staff2"), createdBy: person("staff2"), assignee: person("staff"), result: "Holds charge for 6 hours." });
    expect(res.body.completedAt).toEqual(expect.any(String));
    expect((await events(res.body.id)).map((e) => e.type)).toEqual(["CREATED"]);
  });

  it("API-05 an Administrator creates, edits, completes, and cancels actions like IT Staff", async () => {
    const t = await makeTicket();
    const a = await create(t, "admin", planned({ assigneeId: users.admin.id }));
    expect(a.status).toBe(201);
    expect((await edit(t, a.body.id, "admin", { expectedVersion: 1, description: "Order a battery" })).status).toBe(200);
    const done = await setStatus(t, a.body.id, "admin", { status: "COMPLETED", expectedVersion: 2, result: "Battery ordered." });
    expect(done.status).toBe(200);
    expect(done.body.performedBy).toEqual(person("admin"));
    const b = await create(t, "admin", planned());
    const gone = await setStatus(t, b.body.id, "admin", { status: "CANCELLED", expectedVersion: 1, reason: "No longer needed after the swap." });
    expect(gone.status).toBe(200);
    expect(gone.body.cancelledBy).toEqual(person("admin"));
  });

  it("API-06 refuses each invalid field with 400 and stores nothing", async () => {
    const t = await makeTicket();
    const cases: [object, string][] = [
      [planned({ description: undefined }), "description"],
      [planned({ description: "   " }), "description"],
      [completed({ result: undefined }), "result"],
      [planned({ followUpRequired: true }), "followUpNote"],
      [planned({ description: "d".repeat(2001) }), "description"],
      [planned({ result: "r".repeat(2001) }), "result"],
      [planned({ followUpRequired: true, followUpNote: "n".repeat(1001) }), "followUpNote"],
      [planned({ attachmentNotes: "a".repeat(1001) }), "attachmentNotes"],
      [planned({ actionAt: iso(365 * 24 + 1) }), "actionAt"],
      [completed({ actionAt: iso(1) }), "actionAt"],
      [planned({ actionAt: iso(-11 * 24) }), "actionAt"],
      [planned({ actionAt: "2026-10-06T09:00:00" }), "actionAt"],
      [planned({ status: "DONE" }), "status"],
      [planned({ clientRequestId: "not-a-uuid" }), "clientRequestId"],
    ];
    for (const [body, field] of cases) {
      const res = await create(t, "staff", body);
      expect(res.status, field).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.fields[field], JSON.stringify(body).slice(0, 80)).toBeTruthy();
    }
    expect(await prisma.actionTaken.count({ where: { ticketId: t } })).toBe(0);
  });

  it("API-07 rejects an inactive, Requester, or unknown assignee on create and on edit", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned())).body;
    for (const assigneeId of [users.inactiveStaff.id, users.inactiveAdmin.id, users.requester.id, 2_000_000_000]) {
      const made = await create(t, "staff", planned({ assigneeId }));
      expect(made.status, String(assigneeId)).toBe(400);
      expect(made.body.error.fields.assigneeId).toBeTruthy();
      const changed = await edit(t, a.id, "staff", { expectedVersion: 1, assigneeId });
      expect(changed.status, String(assigneeId)).toBe(400);
      expect(changed.body.error.fields.assigneeId).toBeTruthy();
    }
    expect(await prisma.actionTaken.count({ where: { ticketId: t } })).toBe(1);
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(1);
  });

  it("API-08 keeps an assignee who is deactivated later, shown as inactive", async () => {
    const t = await makeTicket();
    const temp = await prisma.user.create({ data: { name: `Actions temp ${stamp}`, email: `actions.temp.${stamp}@kmutt.ac.th`, role: "IT_STAFF", mustChangePassword: false } });
    try {
      const a = await create(t, "staff", planned({ assigneeId: temp.id }));
      expect(a.status).toBe(201);
      await prisma.user.update({ where: { id: temp.id }, data: { isActive: false } });
      const [row] = (await list(t, "staff")).body.data;
      expect(row.assignee).toEqual({ id: temp.id, name: temp.name, role: "IT_STAFF", isActive: false });
    } finally {
      await prisma.ticket.deleteMany({ where: { id: t } });
      await prisma.user.delete({ where: { id: temp.id } });
    }
  });
});

describe("editing (BR-13, BR-22, BR-23)", () => {
  it("API-09 records each changed field's old and new value and raises the version", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned())).body;
    const res = await edit(t, a.id, "staff2", { expectedVersion: 1, description: "Replace battery and charger.", assigneeId: users.staff2.id, attachmentNotes: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 2, description: "Replace battery and charger.", assignee: person("staff2"), createdBy: person("staff") });
    const log = await events(a.id);
    expect(log.map((e) => [e.type, e.actorId])).toEqual([["CREATED", users.staff.id], ["UPDATED", users.staff2.id]]);
    expect(log[1].changes).toEqual({
      description: { from: "Replace the laptop battery.", to: "Replace battery and charger." },
      assigneeId: { from: users.staff.id, to: users.staff2.id },
    });
  });

  it("API-10 an edit that changes nothing writes nothing", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned())).body;
    const before = (await prisma.ticket.findUniqueOrThrow({ where: { id: t } })).updatedAt;
    const res = await edit(t, a.id, "staff", { expectedVersion: 1, description: "  Replace the laptop battery.  ", assigneeId: users.staff.id, actionAt: a.actionAt });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(await events(a.id)).toHaveLength(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t } })).updatedAt).toEqual(before);
  });
});

describe("completing and cancelling (BR-10 to BR-13)", () => {
  it("API-11 completes with a result; Performed by is whoever completes it, not the assignee", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned({ actionAt: iso(-1) }))).body;
    const missing = await setStatus(t, a.id, "staff2", { status: "COMPLETED", expectedVersion: 1 });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.result).toBeTruthy();
    const res = await setStatus(t, a.id, "staff2", { status: "COMPLETED", expectedVersion: 1, result: "Battery replaced." });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "COMPLETED", version: 2, assignee: person("staff"), performedBy: person("staff2"), result: "Battery replaced." });
    expect(res.body.completedAt).toEqual(expect.any(String));
    const log = await events(a.id);
    expect(log.map((e) => e.type)).toEqual(["CREATED", "COMPLETED"]);
    expect((log[1].changes as Record<string, unknown>).status).toEqual({ from: "PLANNED", to: "COMPLETED" });
    // A planned action dated in the future cannot be completed without moving its date (BR-07).
    const future = (await create(t, "staff", planned({ actionAt: iso(48) }))).body;
    const early = await setStatus(t, future.id, "staff", { status: "COMPLETED", expectedVersion: 1, result: "Done early." });
    expect(early.status).toBe(400);
    expect(early.body.error.fields.actionAt).toBeTruthy();
    expect((await setStatus(t, future.id, "staff", { status: "COMPLETED", expectedVersion: 1, result: "Done early.", actionAt: iso(-0.5) })).status).toBe(200);
  });

  it("API-12 cancels with a reason of at least 10 characters", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned())).body;
    const short = await setStatus(t, a.id, "staff", { status: "CANCELLED", expectedVersion: 1, reason: "123456789" });
    expect(short.status).toBe(400);
    expect(short.body.error.fields.reason).toBeTruthy();
    const res = await setStatus(t, a.id, "staff", { status: "CANCELLED", expectedVersion: 1, reason: "1234567890" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "CANCELLED", cancelReason: "1234567890", cancelledBy: person("staff"), performedBy: null, version: 2 });
    expect(res.body.cancelledAt).toEqual(expect.any(String));
    expect((await events(a.id)).map((e) => e.type)).toEqual(["CREATED", "CANCELLED"]);
  });

  it("API-13 refuses any change to a completed or cancelled action", async () => {
    const t = await makeTicket();
    const done = (await create(t, "staff", completed())).body;
    const gone = (await create(t, "staff", planned())).body;
    await setStatus(t, gone.id, "staff", { status: "CANCELLED", expectedVersion: 1, reason: "Not needed any more." });
    for (const [a, version] of [[done.id, 1], [gone.id, 2]] as const) {
      const attempts = [
        await edit(t, a, "staff", { expectedVersion: version, description: "Changed afterwards" }),
        await setStatus(t, a, "staff", { status: "COMPLETED", expectedVersion: version, result: "Again" }),
        await setStatus(t, a, "staff", { status: "CANCELLED", expectedVersion: version, reason: "Cancel it after all" }),
      ];
      for (const res of attempts) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("ACTION_NOT_PLANNED");
      }
    }
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: done.id } })).description).toBe("Replaced the laptop battery.");
    expect(await events(done.id)).toHaveLength(1);
    expect(await events(gone.id)).toHaveLength(2);
  });
});

describe("history (BR-22)", () => {
  it("API-14 lists every event oldest first, and nothing can change it", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned({ actionAt: iso(-1) }))).body;
    await edit(t, a.id, "staff2", { expectedVersion: 1, description: "Step one" });
    await edit(t, a.id, "staff", { expectedVersion: 2, attachmentNotes: "See photo-2.jpg" });
    await setStatus(t, a.id, "admin", { status: "COMPLETED", expectedVersion: 3, result: "Finished." });
    const res = await history(t, a.id, "staff");
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { type: string; actor: { id: number } }) => [e.type, e.actor.id])).toEqual([
      ["CREATED", users.staff.id],
      ["UPDATED", users.staff2.id],
      ["UPDATED", users.staff.id],
      ["COMPLETED", users.admin.id],
    ]);
    expect(res.body.data[0].actor).toEqual(person("staff"));
    expect((await history(t, a.id, "admin")).body).toEqual(res.body);

    const path = `${base(t)}/${a.id}`;
    const writes = [
      request(app).put(`${path}/history`).set("Cookie", cookies.staff).send({}),
      request(app).delete(`${path}/history`).set("Cookie", cookies.staff),
      request(app).patch(`${path}/history`).set("Cookie", cookies.staff).send({}),
      request(app).post(`${path}/history`).set("Cookie", cookies.staff).send({}),
      request(app).delete(path).set("Cookie", cookies.staff),
      request(app).put(path).set("Cookie", cookies.staff).send({}),
    ];
    for (const res2 of await Promise.all(writes)) expect(res2.status).toBe(404);
    expect(await events(a.id)).toHaveLength(4);
    expect(await prisma.actionTaken.count({ where: { id: a.id } })).toBe(1);
  });
});

describe("stale updates (BR-25, BR-26)", () => {
  it("API-15 refuses an out-of-date expectedVersion and a missing one", async () => {
    const t = await makeTicket();
    const a = (await create(t, "staff", planned({ actionAt: iso(-1) }))).body;
    await edit(t, a.id, "staff", { expectedVersion: 1, description: "Second version" });
    for (const res of [
      await edit(t, a.id, "staff2", { expectedVersion: 1, description: "Based on an old screen" }),
      await setStatus(t, a.id, "staff2", { status: "COMPLETED", expectedVersion: 1, result: "Old screen" }),
      await setStatus(t, a.id, "staff2", { status: "CANCELLED", expectedVersion: 1, reason: "Old screen, cancel" }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("STALE_STATE");
    }
    const missing = await edit(t, a.id, "staff", { description: "No version" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.expectedVersion).toBeTruthy();
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } });
    expect([row.version, row.description, row.status]).toEqual([2, "Second version", "PLANNED"]);
    expect(await events(a.id)).toHaveLength(2);
  });

  it("API-16 lets exactly one of two simultaneous edits from the same version win (10 runs)", async () => {
    const t = await makeTicket();
    for (let run = 0; run < 10; run += 1) {
      const a = (await create(t, "staff", planned())).body;
      const results = await Promise.all([
        edit(t, a.id, "staff", { expectedVersion: 1, description: `First writer ${run}` }),
        edit(t, a.id, "staff2", { expectedVersion: 1, description: `Second writer ${run}` }),
      ]);
      expect(results.map((r) => r.status).sort(), `run ${run}`).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("STALE_STATE");
      expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(2);
      expect((await events(a.id)).map((e) => e.type)).toEqual(["CREATED", "UPDATED"]);
    }
  });
});

describe("ticket state (BR-20, BR-21)", () => {
  it("API-17 refuses every write on a resolved, closed, or cancelled ticket, and still lists", async () => {
    for (const [status, code] of [["RESOLVED", "TICKET_RESOLVED"], ["CLOSED", "TICKET_CLOSED"], ["CANCELLED", "TICKET_CLOSED"]] as const) {
      const t = await makeTicket();
      const a = (await create(t, "staff", planned())).body;
      await prisma.ticket.update({ where: { id: t }, data: { currentStatus: status } });
      for (const res of [
        await create(t, "staff", planned()),
        await edit(t, a.id, "staff", { expectedVersion: 1, description: "Too late" }),
        await setStatus(t, a.id, "staff", { status: "COMPLETED", expectedVersion: 1, result: "Too late", actionAt: iso(-1) }),
        await setStatus(t, a.id, "staff", { status: "CANCELLED", expectedVersion: 1, reason: "Too late to cancel" }),
      ]) {
        expect(res.status, status).toBe(409);
        expect(res.body.error.code, status).toBe(code);
      }
      const listed = await list(t, "staff");
      expect(listed.status).toBe(200);
      expect(listed.body.data).toHaveLength(1);
      expect(await events(a.id)).toHaveLength(1);
    }
  });

  it("API-22 every effective write advances the ticket's Last Updated time", async () => {
    const t = await makeTicket();
    const stampOf = async () => (await prisma.ticket.findUniqueOrThrow({ where: { id: t } })).updatedAt.getTime();
    let last = await stampOf();
    const step = async (label: string, run: () => Promise<{ status: number }>) => {
      await new Promise((r) => setTimeout(r, 5));
      expect((await run()).status, label).toBeLessThan(300);
      const now = await stampOf();
      expect(now, label).toBeGreaterThan(last);
      last = now;
    };
    let id = 0;
    await step("create", async () => {
      const res = await create(t, "staff", planned({ actionAt: iso(-1) }));
      id = res.body.id;
      return res;
    });
    await step("edit", () => edit(t, id, "staff", { expectedVersion: 1, description: "Edited" }));
    await step("complete", () => setStatus(t, id, "staff", { status: "COMPLETED", expectedVersion: 2, result: "Done" }));
    const other = (await create(t, "staff", planned())).body.id;
    last = await stampOf();
    await step("cancel", () => setStatus(t, other, "staff", { status: "CANCELLED", expectedVersion: 1, reason: "Not needed any more." }));
  });
});

describe("server-owned fields and duplicates (BR-09, BR-43)", () => {
  it("API-18 ignores client-supplied creator, performer, version, times, ticket, and status on edit", async () => {
    const t = await makeTicket();
    const elsewhere = await makeTicket();
    const res = await create(t, "staff", planned({
      createdById: users.admin.id, performedById: users.admin.id, version: 9, completedAt: iso(-5), cancelledAt: iso(-5), ticketId: elsewhere, createdAt: iso(-100),
    }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticketId: t, createdBy: person("staff"), performedBy: null, version: 1, completedAt: null, cancelledAt: null });
    expect(Date.now() - new Date(res.body.createdAt).getTime()).toBeLessThan(60_000);
    const changed = await edit(t, res.body.id, "staff", { expectedVersion: 1, description: "Edited", status: "COMPLETED", ticketId: elsewhere, version: 50, createdById: users.admin.id });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ ticketId: t, status: "PLANNED", version: 2, createdBy: person("staff") });
    expect(await prisma.actionTaken.count({ where: { ticketId: elsewhere } })).toBe(0);
  });

  it("API-19 creates one action per clientRequestId and user, even when the requests arrive together", async () => {
    const t = await makeTicket();
    const key = crypto.randomUUID();
    const first = await create(t, "staff", planned({ clientRequestId: key }));
    const repeat = await create(t, "staff", planned({ clientRequestId: key }));
    expect([first.status, repeat.status]).toEqual([201, 200]);
    expect(repeat.body).toEqual(first.body);
    expect(await events(first.body.id)).toHaveLength(1);

    const together = crypto.randomUUID();
    const pair = await Promise.all([create(t, "staff", planned({ clientRequestId: together })), create(t, "staff", planned({ clientRequestId: together }))]);
    expect(pair.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(pair[0].body.id).toBe(pair[1].body.id);

    // The key belongs to its creator: another user's identical key is a new action.
    const theirs = await create(t, "staff2", planned({ clientRequestId: key }));
    expect(theirs.status).toBe(201);
    expect(theirs.body.id).not.toBe(first.body.id);
    expect(await prisma.actionTaken.count({ where: { ticketId: t } })).toBe(3);
  });

  it("API-20 accepts a follow-up only of a completed action that needs one, on the same ticket", async () => {
    const t = await makeTicket();
    const needs = (await create(t, "staff", completed({ followUpRequired: true, followUpNote: "Check again in a week." }))).body;
    expect(needs.followUpHandled).toBe(false);
    const plain = (await create(t, "staff", completed())).body;
    const open = (await create(t, "staff", planned())).body;
    const other = await makeTicket();
    const foreign = (await create(other, "staff", completed({ followUpRequired: true, followUpNote: "Elsewhere." }))).body;
    for (const followUpOfId of [plain.id, open.id, foreign.id, 2_000_000_000]) {
      const res = await create(t, "staff", completed({ followUpOfId }));
      expect(res.status, String(followUpOfId)).toBe(400);
      expect(res.body.error.fields.followUpOfId).toBeTruthy();
    }
    const followUp = await create(t, "staff", planned({ followUpOfId: needs.id, actionAt: iso(-1) }));
    expect(followUp.status).toBe(201);
    expect(followUp.body.followUpOfId).toBe(needs.id);
    // Planned is not handled; completed is.
    const handled = () => list(t, "staff").then((r) => r.body.data.find((a: { id: number }) => a.id === needs.id).followUpHandled);
    expect(await handled()).toBe(false);
    await setStatus(t, followUp.body.id, "staff", { status: "COMPLETED", expectedVersion: 1, result: "Checked: still fine." });
    expect(await handled()).toBe(true);
    // The link is fixed once made.
    await edit(t, followUp.body.id, "staff", { expectedVersion: 2, followUpOfId: null });
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: followUp.body.id } })).followUpOfId).toBe(needs.id);
  });
});

describe("the Requester's view (BR-18, BR-19)", () => {
  it("API-21 a Requester reads every field of the actions on their own ticket", async () => {
    const t = await makeTicket("IN_PROGRESS", "requester");
    const made = (await create(t, "staff", completed({ followUpRequired: true, followUpNote: "Call back Monday.", attachmentNotes: "photo.jpg" }))).body;
    const res = await list(t, "requester");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([made]);
    expect(res.body.data[0]).toMatchObject({ assignee: person("staff"), followUpNote: "Call back Monday.", attachmentNotes: "photo.jpg" });
    expect((await list(t, "other")).status).toBe(404);
  });
});
