import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import type { Priority, Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { storedFilePath } from "../../src/attachmentStorage.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// API-41 to API-58, API-74 to API-76, API-78, API-81 — IT Staff Ticket Detail and
// the ticket workflow (docs/lab-03/api-spec.md §5.2, §5.4 to §5.6; BR-29 to
// BR-48, BR-80, BR-81).
//
// Every user, ticket, attachment, and file here is created by this file and
// removed afterwards (D-22).

const prisma = getPrisma();
const stamp = Date.now();
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const BR_41: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
};
const SUMMARY = "Replaced the battery and confirmed a full day of use.";
const REASON = "Duplicate of an earlier ticket for the same laptop.";
// Body text that satisfies every target, so a test of one rule is never stopped
// by another (BR-44, BR-45).
const TEXT = { resolutionSummary: SUMMARY, reason: REASON };

type Who = "staff" | "staff2" | "admin" | "requester";
const users = {} as Record<Who | "admin2" | "inactiveStaff" | "otherRequester", number>;
const cookies = {} as Record<Who, string>;
const ticketIds: number[] = [];
const files: string[] = [];
let category: number;
let system: number;

async function ticket(status: TicketStatus = "NEW", owner: number | null = null, data: Record<string, unknown> = {}) {
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `SD${stamp}${String(ticketIds.length).padStart(4, "0")}`,
      requesterId: users.requester,
      categoryId: category,
      relatedSystemId: system,
      summary: "Staff detail fixture",
      description: "Created by the Lab 3 staff ticket detail suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      ownerId: owner,
      ...data,
    },
  });
  ticketIds.push(row.id);
  // Lab 4 BR-46 (setup only): an owned ticket being worked has its work on
  // record, so the resolution gate (Lab 4 BR-28) lets the Lab 3 workflow
  // tests resolve it exactly as before.
  if (owner !== null && ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(status)) {
    await prisma.actionTaken.create({
      data: {
        ticketId: row.id, actionAt: new Date(), description: "Work done (fixture)", status: "COMPLETED", result: "Done.",
        assigneeId: owner, createdById: owner, performedById: owner, completedAt: new Date(),
      },
    });
  }
  return row.id;
}
const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });

const detail = (id: number, who: Who = "staff") => request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookies[who]);
const patch = (id: number, what: "owner" | "it-priority" | "status", body: object, who: Who = "staff") =>
  request(app).patch(`/api/staff/tickets/${id}/${what}`).set("Cookie", cookies[who]).send(body);
const claim = (id: number, who: Who = "staff", over: object = {}) =>
  patch(id, "owner", { ownerId: users[who], expectedOwnerId: null, expectedStatus: "NEW", ...over }, who);
const move = (id: number, status: TicketStatus, expectedStatus: TicketStatus, expectedOwnerId: number | null, over: object = {}) =>
  patch(id, "status", { status, expectedStatus, expectedOwnerId, ...TEXT, ...over });

beforeAll(async () => {
  category = (await prisma.category.findFirstOrThrow()).id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const make = async (key: keyof typeof users, role: Role, isActive = true) => {
    const user = await prisma.user.create({
      data: { name: `Detail ${key} ${stamp}`, email: `detail.${key.toLowerCase()}.${stamp}@kmutt.ac.th`, role, isActive, mustChangePassword: false },
    });
    users[key] = user.id;
    if (isActive && ["staff", "staff2", "admin", "requester"].includes(key)) cookies[key as Who] = await sessionCookieFor(prisma, user.id);
  };
  await make("staff", "IT_STAFF");
  await make("staff2", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
  await make("admin2", "ADMINISTRATOR");
  await make("inactiveStaff", "IT_STAFF", false);
  await make("requester", "REQUESTER");
  await make("otherRequester", "REQUESTER");
});

afterAll(async () => {
  await endTestSessions(prisma);
  await Promise.all(files.map((f) => fs.unlink(storedFilePath(f)).catch(() => {})));
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

describe("GET /api/staff/tickets/:id (§5.2)", () => {
  async function ticketWithAttachments() {
    const id = await ticket("IN_PROGRESS", users.staff2);
    const active = `detail-${stamp}-${id}-a.png`;
    const removed = `detail-${stamp}-${id}-r.png`;
    files.push(active, removed);
    await fs.writeFile(storedFilePath(active), "png-bytes");
    await fs.writeFile(storedFilePath(removed), "png-bytes");
    const a = await prisma.attachment.create({ data: { ticketId: id, originalFilename: "screen.png", storedFilename: active, mimeType: "image/png", sizeBytes: 9 } });
    const r = await prisma.attachment.create({
      data: { ticketId: id, originalFilename: "old.png", storedFilename: removed, mimeType: "image/png", sizeBytes: 9, isRemoved: true, removedAt: new Date(), removedReason: "Wrong screenshot" },
    });
    return { id, active: a.id, removed: r.id };
  }

  it("API-41 gives IT Staff the full ticket, both attachments, the BR-41 row, and every capability", async () => {
    const { id, active, removed } = await ticketWithAttachments();
    const res = await detail(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      requester: { id: users.requester, name: `Detail requester ${stamp}`, email: `detail.requester.${stamp}@kmutt.ac.th`, isActive: true },
      category: { id: category },
      relatedSystem: { id: system },
      summary: "Staff detail fixture",
      description: "Created by the Lab 3 staff ticket detail suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "IN_PROGRESS",
      owner: { id: users.staff2, role: "IT_STAFF", isActive: true },
      resolutionSummary: null,
      requesterResolvedAt: null,
      permittedTransitions: BR_41.IN_PROGRESS,
      capabilities: { canAssign: true, canChangePriority: true, canChangeStatus: true, canPostComment: true, canPostNote: true },
    });
    expect(res.body.attachments.map((a: { id: number; isRemoved: boolean }) => [a.id, a.isRemoved])).toEqual([[active, false], [removed, true]]);
    expect(res.body.attachments[1].removedReason).toBe("Wrong screenshot");
    expect((await detail(2_000_000_000)).status).toBe(404);
  });

  // Lab 4 BR-17 (BR-46): Administrators may now write Actions Taken, so their one
  // capability is canWriteActions; every Lab 3 ticket operation stays closed (BR-21).
  it("API-42 gives an Administrator the same ticket with no transitions and no Lab 3 ticket capabilities (BR-21)", async () => {
    const { id } = await ticketWithAttachments();
    const staff = (await detail(id)).body;
    const admin = await detail(id, "admin");
    expect(admin.status).toBe(200);
    expect(admin.body.permittedTransitions).toEqual([]);
    expect(admin.body.capabilities).toEqual({ canAssign: false, canChangePriority: false, canChangeStatus: false, canPostComment: false, canPostNote: false, canWriteActions: true });
    const { permittedTransitions: _a, capabilities: _b, ...staffData } = staff;
    const { permittedTransitions: _c, capabilities: _d, ...adminData } = admin.body;
    expect(adminData).toEqual(staffData);
    // A Requester never reaches this route.
    expect((await detail(id, "requester")).status).toBe(403);
  });

  it("API-43 lets IT Staff and Administrators download an active attachment on anyone's ticket, never a removed one", async () => {
    const { id, active, removed } = await ticketWithAttachments();
    for (const who of ["staff", "admin"] as const) {
      const ok = await request(app).get(`/api/tickets/${id}/attachments/${active}/download`).set("Cookie", cookies[who]);
      expect(ok.status, who).toBe(200);
      const gone = await request(app).get(`/api/tickets/${id}/attachments/${removed}/download`).set("Cookie", cookies[who]);
      expect(gone.status, who).toBe(404);
    }
  });

  it("describes a terminal ticket as closed to every action, and an open one without an owner as assignable", async () => {
    const closed = await ticket("CLOSED", users.staff);
    expect((await detail(closed)).body).toMatchObject({
      permittedTransitions: [],
      capabilities: { canAssign: false, canChangePriority: false, canChangeStatus: false, canPostComment: false, canPostNote: true },
    });
    const fresh = await ticket("NEW");
    expect((await detail(fresh)).body).toMatchObject({ permittedTransitions: ["CANCELLED"], capabilities: { canAssign: true, canChangeStatus: true } });
  });
});

describe("ownership (§5.4, BR-29 to BR-32, BR-36)", () => {
  it("API-44 a claim makes the caller the owner and opens the NEW ticket in the same change", async () => {
    const id = await ticket("NEW");
    const res = await claim(id);
    expect(res.status).toBe(200);
    // Lab 4 BR-30 (BR-46): a ticket with no completed work is not offered
    // Resolved yet; the rest of the Lab 3 OPEN row is unchanged.
    expect(res.body).toMatchObject({ currentStatus: "OPEN", owner: { id: users.staff }, permittedTransitions: BR_41.OPEN.filter((s) => s !== "RESOLVED") });
    expect(await row(id)).toMatchObject({ ownerId: users.staff, currentStatus: "OPEN" });
  });

  it("API-45 refuses a stale owner or status with 409 STALE_STATE, and lets exactly one of two parallel claims win", async () => {
    const id = await ticket("NEW");
    expect((await claim(id)).status).toBe(200);
    const staleOwner = await claim(id, "staff2", { expectedStatus: "OPEN" });
    expect(staleOwner.status).toBe(409);
    expect(staleOwner.body.error.code).toBe("STALE_STATE");
    const staleStatus = await claim(id, "staff2", { expectedOwnerId: users.staff });
    expect(staleStatus.status).toBe(409);
    expect(staleStatus.body.error.code).toBe("STALE_STATE");
    expect((await row(id)).ownerId).toBe(users.staff);

    for (let i = 0; i < 5; i++) {
      const race = await ticket("NEW");
      const results = await Promise.all([claim(race, "staff"), claim(race, "staff2")]);
      expect(results.map((r) => r.status).sort(), `run ${i}`).toEqual([200, 409]);
      const winner = results.find((r) => r.status === 200)!.body.owner.id;
      expect((await row(race)).ownerId).toBe(winner);
    }
  });

  it("API-46 assigns to an active IT Staff member and to an active Administrator", async () => {
    const id = await ticket("OPEN", users.staff);
    const toStaff = await patch(id, "owner", { ownerId: users.staff2, expectedOwnerId: users.staff, expectedStatus: "OPEN" });
    expect(toStaff.status).toBe(200);
    expect(toStaff.body.owner.id).toBe(users.staff2);
    const toAdmin = await patch(id, "owner", { ownerId: users.admin2, expectedOwnerId: users.staff2, expectedStatus: "OPEN" });
    expect(toAdmin.status).toBe(200);
    expect(toAdmin.body.owner).toMatchObject({ id: users.admin2, role: "ADMINISTRATOR" });
  });

  it("API-47 refuses an inactive user, a Requester, or a missing id on fields.ownerId, changing nothing", async () => {
    const id = await ticket("OPEN", users.staff);
    for (const ownerId of [users.inactiveStaff, users.requester, 2_000_000_000]) {
      const res = await patch(id, "owner", { ownerId, expectedOwnerId: users.staff, expectedStatus: "OPEN" });
      expect(res.status, String(ownerId)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.fields.ownerId).toBeTruthy();
    }
    expect((await row(id)).ownerId).toBe(users.staff);
  });

  it("API-48 unassigns an OPEN ticket but refuses an IN_PROGRESS one with 409 OWNER_REQUIRED", async () => {
    const open = await ticket("OPEN", users.staff);
    const res = await patch(open, "owner", { ownerId: null, expectedOwnerId: users.staff, expectedStatus: "OPEN" });
    expect(res.status).toBe(200);
    expect(await row(open)).toMatchObject({ ownerId: null, currentStatus: "OPEN" });
    const busy = await ticket("IN_PROGRESS", users.staff);
    const refused = await patch(busy, "owner", { ownerId: null, expectedOwnerId: users.staff, expectedStatus: "IN_PROGRESS" });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("OWNER_REQUIRED");
    expect((await row(busy)).ownerId).toBe(users.staff);
  });

  it("API-49 keeps a deactivated owner on the ticket, shown as inactive, in the detail and the queue", async () => {
    const temp = await prisma.user.create({
      data: { name: `Detail leaver ${stamp}`, email: `detail.leaver.${stamp}@kmutt.ac.th`, role: "IT_STAFF", mustChangePassword: false },
    });
    const id = await ticket("IN_PROGRESS", temp.id, { summary: `Leaver fixture ${stamp}` });
    await prisma.user.update({ where: { id: temp.id }, data: { isActive: false } });
    expect((await detail(id)).body.owner).toEqual({ id: temp.id, name: `Detail leaver ${stamp}`, role: "IT_STAFF", isActive: false });
    const queue = await request(app).get(`/api/staff/tickets?search=Leaver fixture ${stamp}`).set("Cookie", cookies.staff);
    expect(queue.body.data[0].owner).toMatchObject({ id: temp.id, isActive: false });
    await prisma.ticket.delete({ where: { id } });
    ticketIds.splice(ticketIds.indexOf(id), 1);
    await prisma.user.delete({ where: { id: temp.id } });
  });

  it("API-51 refuses owner and IT Priority changes on CLOSED and CANCELLED tickets with 409 TICKET_CLOSED", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const id = await ticket(status, users.staff);
      const owner = await patch(id, "owner", { ownerId: users.staff2, expectedOwnerId: users.staff, expectedStatus: status });
      expect(owner.status, status).toBe(409);
      expect(owner.body.error.code).toBe("TICKET_CLOSED");
      const priority = await patch(id, "it-priority", { itPriority: "HIGH", expectedStatus: status });
      expect(priority.status, status).toBe(409);
      expect(priority.body.error.code).toBe("TICKET_CLOSED");
      expect(await row(id)).toMatchObject({ ownerId: users.staff, itPriority: "MEDIUM" });
    }
  });
});

describe("IT Priority (§5.5, BR-33, BR-34)", () => {
  it("API-50 changes IT Priority and never Requested Priority, whatever the body says", async () => {
    const id = await ticket("OPEN", users.staff);
    const res = await patch(id, "it-priority", { itPriority: "HIGH", expectedStatus: "OPEN", requestedPriority: "LOW" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ itPriority: "HIGH", requestedPriority: "MEDIUM" });
    expect(await row(id)).toMatchObject({ itPriority: "HIGH", requestedPriority: "MEDIUM" });
    // Setting the current value again is a harmless 200.
    expect((await patch(id, "it-priority", { itPriority: "HIGH", expectedStatus: "OPEN" })).status).toBe(200);
    // No route at all accepts a Requested Priority change.
    for (const what of ["owner", "status"] as const) {
      await patch(id, what, { requestedPriority: "LOW" });
      expect((await row(id)).requestedPriority).toBe("MEDIUM");
    }
  });
});

describe("status transitions (§5.6, BR-41 to BR-45, BR-48)", () => {
  it("API-52 performs every permitted transition and stores it", async () => {
    let done = 0;
    for (const from of ALL) {
      for (const to of BR_41[from]) {
        const id = await ticket(from, users.staff, from === "RESOLVED" ? { resolutionSummary: SUMMARY } : {});
        const res = await move(id, to, from, users.staff);
        expect(res.status, `${from} -> ${to}`).toBe(200);
        expect(res.body.currentStatus).toBe(to);
        expect((await row(id)).currentStatus, `${from} -> ${to}`).toBe(to);
        done++;
      }
    }
    expect(done).toBe(17);
  });

  it("API-53 refuses every other pair — same status and terminal sources included — with 409 INVALID_TRANSITION", async () => {
    let refused = 0;
    for (const from of ALL) {
      for (const to of ALL.filter((t) => !BR_41[from].includes(t))) {
        const id = await ticket(from, users.staff);
        const res = await move(id, to, from, users.staff);
        expect(res.status, `${from} -> ${to}`).toBe(409);
        expect(res.body.error.code, `${from} -> ${to}`).toBe("INVALID_TRANSITION");
        expect((await row(id)).currentStatus).toBe(from);
        refused++;
      }
    }
    expect(refused).toBe(64 - 17);
  });

  it("API-54 refuses a stale expectedStatus with 409 STALE_STATE", async () => {
    const id = await ticket("IN_PROGRESS", users.staff);
    const res = await move(id, "WAITING_FOR_REQUESTER", "OPEN", users.staff);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_STATE");
    const staleOwner = await move(id, "WAITING_FOR_REQUESTER", "IN_PROGRESS", users.staff2);
    expect(staleOwner.body.error.code).toBe("STALE_STATE");
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
  });

  it("API-55 needs an owner for every target but CANCELLED, and NEW opens only by assignment", async () => {
    for (const to of BR_41.OPEN) {
      const id = await ticket("OPEN", null);
      const res = await move(id, to, "OPEN", null);
      if (to === "CANCELLED") {
        expect(res.status, to).toBe(200);
      } else {
        expect(res.status, to).toBe(409);
        expect(res.body.error.code, to).toBe("OWNER_REQUIRED");
        expect((await row(id)).currentStatus).toBe("OPEN");
      }
    }
    const fresh = await ticket("NEW");
    const open = await move(fresh, "OPEN", "NEW", null);
    expect(open.status).toBe(409);
    expect(open.body.error.code).toBe("INVALID_TRANSITION");
    expect((await move(fresh, "CANCELLED", "NEW", null)).status).toBe(200);
  });

  it("API-56 requires a 10–2000 character summary for RESOLVED, shows it to the Requester, and REOPENED clears it", async () => {
    const id = await ticket("IN_PROGRESS", users.staff);
    for (const resolutionSummary of [undefined, "too short", "z".repeat(2001)]) {
      const res = await move(id, "RESOLVED", "IN_PROGRESS", users.staff, { resolutionSummary });
      expect(res.status, String(resolutionSummary).slice(0, 10)).toBe(400);
      expect(res.body.error.fields.resolutionSummary).toBeTruthy();
    }
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
    expect((await move(id, "RESOLVED", "IN_PROGRESS", users.staff, { resolutionSummary: `  ${SUMMARY}  ` })).status).toBe(200);
    expect((await row(id)).resolutionSummary).toBe(SUMMARY);
    const mine = await request(app).get(`/api/tickets/${id}`).set("Cookie", cookies.requester);
    expect(mine.body.resolutionSummary).toBe(SUMMARY);
    expect((await move(id, "REOPENED", "RESOLVED", users.staff)).status).toBe(200);
    expect((await row(id)).resolutionSummary).toBeNull();
  });

  it("API-57 requires a reason for CANCELLED and REOPENED and posts it as the actor's Public Comment, in one transaction", async () => {
    for (const [from, to] of [["IN_PROGRESS", "CANCELLED"], ["RESOLVED", "REOPENED"]] as const) {
      const id = await ticket(from, users.staff, { resolutionSummary: SUMMARY });
      const missing = await move(id, to, from, users.staff, { reason: "   " });
      expect(missing.status).toBe(400);
      expect(missing.body.error.fields.reason).toBeTruthy();
      const ok = await move(id, to, from, users.staff, { reason: `  ${REASON}  ` });
      expect(ok.status, `${from} -> ${to}`).toBe(200);
      const comments = await prisma.publicComment.findMany({ where: { ticketId: id } });
      expect(comments.map((c) => [c.authorId, c.body])).toEqual([[users.staff, REASON]]);
    }
    // Make the comment insert fail after the status update (Postgres refuses a
    // NUL character in text): the status change must be rolled back with it.
    const id = await ticket("IN_PROGRESS", users.staff);
    const broken = await move(id, "CANCELLED", "IN_PROGRESS", users.staff, { reason: `${REASON}\u0000` });
    expect(broken.status).toBe(500);
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
    expect(await prisma.publicComment.count({ where: { ticketId: id } })).toBe(0);
  });

  it("API-58 clears the Requester's appears-resolved signal on any status change", async () => {
    const id = await ticket("IN_PROGRESS", users.staff, { requesterResolvedAt: new Date() });
    expect((await move(id, "WAITING_FOR_REQUESTER", "IN_PROGRESS", users.staff)).status).toBe(200);
    expect((await row(id)).requesterResolvedAt).toBeNull();
    // Assignment that opens a NEW ticket is a status change too.
    const fresh = await ticket("NEW", null, { requesterResolvedAt: new Date() });
    expect((await claim(fresh)).status).toBe(200);
    expect((await row(fresh)).requesterResolvedAt).toBeNull();
  });
});

describe("validation before business rules (BR-22, BR-31, BR-43)", () => {
  it("API-78 the status route answers a bad body with 400, never 409", async () => {
    const id = await ticket("IN_PROGRESS", users.staff);
    const cases: [string, object][] = [
      ["missing expectedStatus", { status: "WAITING_FOR_REQUESTER", expectedOwnerId: users.staff }],
      ["missing expectedOwnerId", { status: "WAITING_FOR_REQUESTER", expectedStatus: "IN_PROGRESS" }],
      ["unknown status", { status: "PENDING", expectedStatus: "IN_PROGRESS", expectedOwnerId: users.staff }],
      // A stale expectedStatus (409 later) *and* a 3-character summary: the 400 comes first.
      ["short summary on a forbidden transition", { status: "RESOLVED", expectedStatus: "CLOSED", expectedOwnerId: null, resolutionSummary: "abc" }],
    ];
    for (const [label, body] of cases) {
      const res = await patch(id, "status", body);
      expect(res.status, label).toBe(400);
      expect(res.body.error.code, label).toBe("VALIDATION_ERROR");
    }
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
  });

  it("API-81 the owner and IT Priority routes answer a missing expected field with 400 and a stale one with 409", async () => {
    const id = await ticket("OPEN", users.staff);
    const missing: [string, "owner" | "it-priority", object][] = [
      ["owner without expectedStatus", "owner", { ownerId: users.staff2, expectedOwnerId: users.staff }],
      ["owner without expectedOwnerId", "owner", { ownerId: users.staff2, expectedStatus: "OPEN" }],
      ["owner without ownerId", "owner", { expectedOwnerId: users.staff, expectedStatus: "OPEN" }],
      ["priority without expectedStatus", "it-priority", { itPriority: "HIGH" }],
      ["priority with an unknown value", "it-priority", { itPriority: "URGENT", expectedStatus: "OPEN" }],
    ];
    for (const [label, what, body] of missing) {
      const res = await patch(id, what, body);
      expect(res.status, label).toBe(400);
      expect(res.body.error.code, label).toBe("VALIDATION_ERROR");
    }
    const staleOwner = await patch(id, "owner", { ownerId: users.staff2, expectedOwnerId: users.staff, expectedStatus: "IN_PROGRESS" });
    expect(staleOwner.status).toBe(409);
    expect(staleOwner.body.error.code).toBe("STALE_STATE");
    const stalePriority = await patch(id, "it-priority", { itPriority: "HIGH", expectedStatus: "IN_PROGRESS" });
    expect(stalePriority.status).toBe(409);
    expect(stalePriority.body.error.code).toBe("STALE_STATE");
    expect(await row(id)).toMatchObject({ ownerId: users.staff, itPriority: "MEDIUM", currentStatus: "OPEN" });
  });

  it("refuses Requesters and Administrators on every write route with 403 (BR-21, BR-39)", async () => {
    const id = await ticket("OPEN", users.staff);
    for (const who of ["requester", "admin"] as const) {
      for (const [what, body] of [
        ["owner", { ownerId: users[who === "admin" ? "admin" : "staff"], expectedOwnerId: users.staff, expectedStatus: "OPEN" }],
        ["it-priority", { itPriority: "HIGH", expectedStatus: "OPEN" }],
        ["status", { status: "RESOLVED", expectedStatus: "OPEN", expectedOwnerId: users.staff, ...TEXT }],
      ] as const) {
        const res = await patch(id, what, body, who);
        expect(res.status, `${who} ${what}`).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
    }
    expect(await row(id)).toMatchObject({ ownerId: users.staff, itPriority: "MEDIUM", currentStatus: "OPEN" });
  });
});

describe("races: every change is checked against the locked row (BR-80)", () => {
  it("API-74 a claim racing a cancellation never leaves a cancelled ticket open or owned", async () => {
    for (let i = 0; i < 5; i++) {
      const id = await ticket("NEW");
      const results = await Promise.all([claim(id), move(id, "CANCELLED", "NEW", null)]);
      expect(results.map((r) => r.status).sort(), `run ${i}`).toEqual([200, 409]);
      const after = await row(id);
      if (after.currentStatus === "CANCELLED") expect(after.ownerId).toBeNull();
      else expect(after).toMatchObject({ currentStatus: "OPEN", ownerId: users.staff });
    }
  });

  it("API-75 an unassignment racing a move to IN_PROGRESS never leaves an ownerless IN_PROGRESS ticket", async () => {
    for (let i = 0; i < 5; i++) {
      const id = await ticket("OPEN", users.staff);
      const results = await Promise.all([
        patch(id, "owner", { ownerId: null, expectedOwnerId: users.staff, expectedStatus: "OPEN" }),
        move(id, "IN_PROGRESS", "OPEN", users.staff),
      ]);
      expect(results.map((r) => r.status).sort(), `run ${i}`).toEqual([200, 409]);
      const after = await row(id);
      expect(after.currentStatus === "IN_PROGRESS" && after.ownerId === null, `run ${i}`).toBe(false);
    }
  });

  it("API-76 a comment, the appears-resolved signal, or an attachment never lands on a ticket that was cancelled first", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082", "hex");
    const actions: [string, (id: number) => request.Test, (id: number) => Promise<boolean>][] = [
      ["comment", (id) => request(app).post(`/api/tickets/${id}/comments`).set("Cookie", cookies.requester).send({ body: "One more detail" }), async (id) => (await prisma.publicComment.count({ where: { ticketId: id, authorId: users.requester } })) > 0],
      // The signal is cleared by any later status change (BR-48), so after a
      // successful mark the cancellation must have come second and cleared it.
      ["appears resolved", (id) => request(app).post(`/api/tickets/${id}/appears-resolved`).set("Cookie", cookies.requester).send({}), async () => true],
      ["attachment", (id) => request(app).post(`/api/tickets/${id}/attachments`).set("Cookie", cookies.requester).attach("file", png, "late.png"), async (id) => (await prisma.attachment.count({ where: { ticketId: id } })) > 0],
    ];
    for (const [label, act, landed] of actions) {
      for (let i = 0; i < 4; i++) {
        const id = await ticket("IN_PROGRESS", users.staff);
        const [other, cancel] = await Promise.all([act(id), move(id, "CANCELLED", "IN_PROGRESS", users.staff)]);
        const stored = await prisma.attachment.findMany({ where: { ticketId: id }, select: { storedFilename: true } });
        files.push(...stored.map((f) => f.storedFilename));
        // Cancellation always wins or loses cleanly; the other change is either
        // in (it committed first) or refused with 409 — never in after a refusal.
        expect(cancel.status, `${label} run ${i}`).toBe(200);
        if (other.status === 409) {
          if (label === "appears resolved") expect((await row(id)).requesterResolvedAt, `${label} run ${i}`).toBeNull();
          else expect(await landed(id), `${label} run ${i}`).toBe(false);
        } else {
          expect([200, 201], `${label} run ${i}`).toContain(other.status);
          expect(await landed(id), `${label} run ${i}`).toBe(true);
        }
        // Either way, the ticket ended cancelled, with no signal left on it.
        expect(await row(id)).toMatchObject({ currentStatus: "CANCELLED", requesterResolvedAt: null });
      }
    }
  });
});
