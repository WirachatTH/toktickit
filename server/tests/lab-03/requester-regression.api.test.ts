import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import { storedFilePath } from "../../src/attachmentStorage.js";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// Requester regression on the Lab 3 schema (docs/lab-03/tests.md §2.4).
// Issue 2 adds the rows its schema change makes necessary (REG-04, REG-17);
// Issue 4 moves the Requester endpoints onto the session (REG-01, REG-02,
// REG-09); Issue 5 removes the selector (REG-17 rewritten) and adds REG-03,
// REG-05 to REG-07; Issue 8 adds "Problem appears resolved" (REG-10 to REG-13).
//
// Uses only users and tickets it creates itself, and removes them afterwards
// (D-22); seeded rows are read, never modified.

const prisma = getPrisma();
const stamp = Date.now();
const createdTicketIds: number[] = [];
const createdUserIds: number[] = [];
let requesterId: number;
let otherRequesterId: number;
const cookies = {} as Record<"requester" | "staff" | "admin", string>;
let staffId: number;
let adminId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  await seed(prisma);
  const make = async (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") => {
    const user = await prisma.user.create({
      data: { name: `Regression ${role} ${stamp}`, email: `regression.${role.toLowerCase()}.${stamp}@kmutt.ac.th`, role, isActive: true, mustChangePassword: false },
    });
    createdUserIds.push(user.id);
    return user.id;
  };
  requesterId = await make("REQUESTER");
  staffId = await make("IT_STAFF");
  adminId = await make("ADMINISTRATOR");
  otherRequesterId = (await prisma.user.create({
    data: { name: `Regression other ${stamp}`, email: `regression.other.${stamp}@kmutt.ac.th`, role: "REQUESTER", mustChangePassword: false },
  })).id;
  createdUserIds.push(otherRequesterId);
  cookies.requester = await sessionCookieFor(prisma, requesterId);
  cookies.staff = await sessionCookieFor(prisma, staffId);
  cookies.admin = await sessionCookieFor(prisma, adminId);
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

afterAll(async () => {
  await endTestSessions(prisma);
  const files = await prisma.attachment.findMany({ where: { ticketId: { in: createdTicketIds } }, select: { storedFilename: true } });
  await Promise.all(files.map((f) => fs.unlink(storedFilePath(f.storedFilename)).catch(() => {})));
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("REG-04 a ticket created through the Lab 2 endpoint on the Lab 3 schema", () => {
  it("starts with IT Priority equal to Requested Priority, no owner, NEW — and the response carries no IT Priority", async () => {
    for (const priority of ["LOW", "MEDIUM", "HIGH"] as const) {
      const res = await request(app)
        .post("/api/tickets")
        .set("Cookie", cookies.requester)
        .field("categoryId", String(categoryId))
        .field("relatedSystemId", String(relatedSystemId))
        .field("summary", `Regression ticket ${priority}`)
        .field("description", "Created by the Lab 3 requester-regression suite to check BR-34.")
        .field("requestedPriority", priority);
      expect(res.status, priority).toBe(201);
      createdTicketIds.push(res.body.id);

      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.requesterId).toBe(requesterId);
      expect(row.requestedPriority).toBe(priority);
      expect(row.itPriority).toBe(priority);
      expect(row.ownerId).toBeNull();
      expect(row.currentStatus).toBe("NEW");
      // D-09 — IT Priority is never shown to a Requester.
      expect(res.body).not.toHaveProperty("itPriority");
    }
  });
});

describe("REG-17 no staff account can act as a Requester", () => {
  // Rewritten in Issue 5 (BR-69): Lab 3 removes the Development Requester list
  // and its header, so the Lab 2-era checks on them are replaced by the rule
  // they protected — a staff account can never act as a Requester.
  it("has no Development Requester list to pick a staff account from", async () => {
    for (const cookie of [undefined, cookies.requester, cookies.staff, cookies.admin]) {
      const res = cookie ? await request(app).get("/api/requesters").set("Cookie", cookie) : await request(app).get("/api/requesters");
      expect(res.status).toBe(404);
    }
  });

  it("refuses a staff session on the Requester endpoints, whatever Requester id the old dev header names", async () => {
    for (const who of ["staff", "admin"] as const) {
      const res = await request(app).get("/api/tickets").set("Cookie", cookies[who]).set("X-Dev-Requester-Id", String(requesterId));
      expect(res.status, who).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });
});

const ticketFields = (summary: string) => ({
  categoryId: String(categoryId),
  relatedSystemId: String(relatedSystemId),
  summary,
  description: "Created by the Lab 3 requester-regression suite to check BR-03.",
});

describe("REG-01, REG-02 a Requester's identity comes only from the session (BR-03)", () => {
  it("REG-01 creates the ticket for the session user, whatever requesterId the body names", async () => {
    let req = request(app).post("/api/tickets").set("Cookie", cookies.requester).set("X-Dev-Requester-Id", String(otherRequesterId));
    for (const [key, value] of Object.entries({ ...ticketFields("Identity check ticket"), requesterId: String(otherRequesterId) })) {
      req = req.field(key, value);
    }
    const res = await req;
    expect(res.status).toBe(201);
    createdTicketIds.push(res.body.id);
    expect(res.body.requesterId).toBe(requesterId);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } })).requesterId).toBe(requesterId);
  });

  it("REG-02 lists only the session user's tickets, whatever requesterId the query or the dev header names", async () => {
    const theirs = await prisma.ticket.create({
      data: {
        ticketNumber: `REG02-${stamp}`,
        requesterId: otherRequesterId,
        categoryId,
        relatedSystemId,
        summary: "Another Requester's ticket",
        description: "Must never appear in the session user's list.",
        itPriority: "MEDIUM",
      },
    });
    createdTicketIds.push(theirs.id);

    const res = await request(app)
      .get(`/api/tickets?requesterId=${otherRequesterId}&pageSize=50`)
      .set("Cookie", cookies.requester)
      .set("X-Dev-Requester-Id", String(otherRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const ids = res.body.data.map((t: { id: number }) => t.id);
    expect(ids).not.toContain(theirs.id);
    const owners = await prisma.ticket.findMany({ where: { id: { in: ids } }, select: { requesterId: true } });
    expect(new Set(owners.map((t) => t.requesterId))).toEqual(new Set([requesterId]));

    // And the dev header alone, with no session, is not an identity any more.
    const headerOnly = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(otherRequesterId));
    expect(headerOnly.status).toBe(401);
    expect(headerOnly.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("REG-09 the Requester ticket endpoints are for Requesters (BR-20)", () => {
  it("refuses IT Staff and Administrators on POST and GET /api/tickets with 403, creating nothing", async () => {
    for (const who of ["staff", "admin"] as const) {
      const list = await request(app).get("/api/tickets").set("Cookie", cookies[who]);
      expect(list.status, `GET as ${who}`).toBe(403);
      expect(list.body).toEqual({ error: { code: "FORBIDDEN", message: list.body.error.message } });

      let create = request(app).post("/api/tickets").set("Cookie", cookies[who]);
      for (const [key, value] of Object.entries(ticketFields(`REG-09 must never exist ${stamp}`))) create = create.field(key, value);
      const created = await create;
      expect(created.status, `POST as ${who}`).toBe(403);
      expect(created.body.error.code).toBe("FORBIDDEN");
    }
    expect(await prisma.ticket.count({ where: { summary: `REG-09 must never exist ${stamp}` } })).toBe(0);
  });
});

async function ticketFor(owner: number, data: Record<string, unknown> = {}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `REG5-${stamp}-${createdTicketIds.length}`,
      requesterId: owner,
      categoryId,
      relatedSystemId,
      summary: "Requester regression fixture",
      description: "Created by the Lab 3 requester-regression suite.",
      itPriority: "HIGH",
      ...data,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

// A real PNG header, so the server's content sniffing accepts it.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082",
  "hex",
);

describe("REG-03 the Lab 2 attachment lifecycle, through a session (FR-12)", () => {
  it("creates with an attachment, lists, opens, adds, downloads, and soft-removes exactly as in Lab 2", async () => {
    let create = request(app).post("/api/tickets").set("Cookie", cookies.requester);
    for (const [key, value] of Object.entries(ticketFields(`REG-03 lifecycle ${stamp}`))) create = create.field(key, value);
    const created = await create.attach("attachments", PNG, "first.png");
    expect(created.status).toBe(201);
    createdTicketIds.push(created.body.id);
    expect(created.body.attachments).toHaveLength(1);

    const list = await request(app).get(`/api/tickets?search=${encodeURIComponent(created.body.ticketNumber)}`).set("Cookie", cookies.requester);
    expect(list.status).toBe(200);
    expect(list.body.data.map((t: { id: number }) => t.id)).toEqual([created.body.id]);
    expect(list.body.data[0].attachmentCount).toBe(1);

    const detail = await request(app).get(`/api/tickets/${created.body.id}`).set("Cookie", cookies.requester);
    expect(detail.status).toBe(200);
    expect(detail.body.summary).toBe(`REG-03 lifecycle ${stamp}`);

    const added = await request(app).post(`/api/tickets/${created.body.id}/attachments`).set("Cookie", cookies.requester).attach("file", PNG, "second.png");
    expect(added.status).toBe(201);

    const download = await request(app)
      .get(`/api/tickets/${created.body.id}/attachments/${added.body.id}/download`)
      .set("Cookie", cookies.requester)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);

    const removed = await request(app)
      .patch(`/api/tickets/${created.body.id}/attachments/${added.body.id}/remove`)
      .set("Cookie", cookies.requester)
      .send({ reason: "Uploaded the wrong file" });
    expect(removed.status).toBe(200);
    expect(removed.body.isRemoved).toBe(true);

    // Removed: no longer downloadable, metadata kept (Lab 2 BR-37).
    expect((await request(app).get(`/api/tickets/${created.body.id}/attachments/${added.body.id}/download`).set("Cookie", cookies.requester)).status).toBe(404);
    const metadata = await request(app).get(`/api/tickets/${created.body.id}/attachments/${added.body.id}`).set("Cookie", cookies.requester);
    expect(metadata.status).toBe(200);
    expect(metadata.body.isRemoved).toBe(true);
  });
});

describe("REG-05 the Requester Ticket Detail payload (BR-71, api-spec §3.3)", () => {
  it("adds owner, resolution summary, and the appears-resolved time — and never IT Priority or notes", async () => {
    const unassigned = await ticketFor(requesterId);
    const open = await request(app).get(`/api/tickets/${unassigned.id}`).set("Cookie", cookies.requester);
    expect(open.status).toBe(200);
    expect(open.body.owner).toBeNull();
    expect(open.body.resolutionSummary).toBeNull();
    expect(open.body.requesterResolvedAt).toBeNull();

    const resolvedAt = new Date("2026-10-01T09:00:00.000Z");
    const resolved = await ticketFor(requesterId, {
      ownerId: staffId,
      currentStatus: "RESOLVED",
      resolutionSummary: "Reset the mailbox password and confirmed sign-in.",
      requesterResolvedAt: resolvedAt,
    });
    await prisma.internalNote.create({ data: { ticketId: resolved.id, authorId: staffId, body: "Internal: never show this to the Requester" } });
    const res = await request(app).get(`/api/tickets/${resolved.id}`).set("Cookie", cookies.requester);
    expect(res.status).toBe(200);
    // The owner as a Person reference (api-spec §0.6): no email or anything else.
    expect(res.body.owner).toEqual({ id: staffId, name: `Regression IT_STAFF ${stamp}`, role: "IT_STAFF", isActive: true });
    expect(res.body.currentStatus).toBe("RESOLVED");
    expect(res.body.resolutionSummary).toBe("Reset the mailbox password and confirmed sign-in.");
    expect(res.body.requesterResolvedAt).toBe(resolvedAt.toISOString());

    const text = JSON.stringify(res.body);
    expect(res.body).not.toHaveProperty("itPriority");
    expect(text).not.toMatch(/itPriority|internalNote|noteCount|"notes"/i);
    expect(text).not.toContain("never show this to the Requester");
  });
});

describe("REG-06 attachments on a closed ticket (BR-70)", () => {
  it("refuses adding or soft-removing on CLOSED and CANCELLED with 409 TICKET_CLOSED, and still downloads", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const ticket = await ticketFor(requesterId, { currentStatus: status });
      const storedFilename = `reg06-${stamp}-${status}.png`;
      await fs.writeFile(storedFilePath(storedFilename), PNG);
      const attachment = await prisma.attachment.create({
        data: { ticketId: ticket.id, originalFilename: "kept.png", storedFilename, mimeType: "image/png", sizeBytes: PNG.length },
      });

      const add = await request(app).post(`/api/tickets/${ticket.id}/attachments`).set("Cookie", cookies.requester).attach("file", PNG, "late.png");
      expect(add.status, `add on ${status}`).toBe(409);
      expect(add.body.error.code).toBe("TICKET_CLOSED");

      const remove = await request(app)
        .patch(`/api/tickets/${ticket.id}/attachments/${attachment.id}/remove`)
        .set("Cookie", cookies.requester)
        .send({ reason: "Trying to change a closed ticket" });
      expect(remove.status, `remove on ${status}`).toBe(409);
      expect(remove.body.error.code).toBe("TICKET_CLOSED");

      const download = await request(app).get(`/api/tickets/${ticket.id}/attachments/${attachment.id}/download`).set("Cookie", cookies.requester);
      expect(download.status, `download on ${status}`).toBe(200);

      expect(await prisma.attachment.count({ where: { ticketId: ticket.id } })).toBe(1);
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).isRemoved).toBe(false);
    }
  });

  it("still lets the Requester add to and remove from a ticket that is not closed", async () => {
    const ticket = await ticketFor(requesterId, { currentStatus: "IN_PROGRESS" });
    const add = await request(app).post(`/api/tickets/${ticket.id}/attachments`).set("Cookie", cookies.requester).attach("file", PNG, "fine.png");
    expect(add.status).toBe(201);
    const remove = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${add.body.id}/remove`)
      .set("Cookie", cookies.requester)
      .send({ reason: "Not needed after all" });
    expect(remove.status).toBe(200);
  });
});

describe("REG-07 reference data stays public (D-18)", () => {
  it("answers categories, systems, and health with their Lab 1/Lab 2 shapes, signed out and as every role", async () => {
    for (const cookie of [undefined, cookies.requester, cookies.staff, cookies.admin]) {
      const get = (path: string) => (cookie ? request(app).get(path).set("Cookie", cookie) : request(app).get(path));
      const health = await get("/api/health");
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: "ok", service: "TokTickIT API" });
      for (const path of ["/api/categories", "/api/systems"]) {
        const res = await get(path);
        expect(res.status, path).toBe(200);
        expect(res.body.length, path).toBeGreaterThan(0);
        for (const row of res.body) expect(Object.keys(row).sort(), path).toEqual(["id", "name"]);
      }
    }
  });
});

const markResolved = (ticket: number, body: object = {}, cookie = cookies.requester) =>
  request(app).post(`/api/tickets/${ticket}/appears-resolved`).set("Cookie", cookie).send(body);

describe("REG-10 to REG-13 'Problem appears resolved' (BR-05, BR-47)", () => {
  it("REG-10 records the time on an own IN_PROGRESS ticket, with or without a comment, and never changes the status", async () => {
    const plain = (await ticketFor(requesterId, { currentStatus: "IN_PROGRESS", ownerId: staffId })).id;
    expect((await request(app).get(`/api/tickets/${plain}`).set("Cookie", cookies.requester)).body.canMarkAppearsResolved).toBe(true);
    const before = Date.now();
    const res = await markResolved(plain);
    expect(res.status).toBe(200);
    expect(res.body.comment).toBeNull();
    expect(new Date(res.body.requesterResolvedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: plain } });
    expect(stored.currentStatus).toBe("IN_PROGRESS");
    expect(stored.requesterResolvedAt).not.toBeNull();
    expect(await prisma.publicComment.count({ where: { ticketId: plain } })).toBe(0);
    expect((await request(app).get(`/api/tickets/${plain}`).set("Cookie", cookies.requester)).body.canMarkAppearsResolved).toBe(false);

    const withComment = (await ticketFor(requesterId, { currentStatus: "WAITING_FOR_REQUESTER", ownerId: staffId })).id;
    const res2 = await markResolved(withComment, { comment: "  Works again after the update.  " });
    expect(res2.status).toBe(200);
    expect(res2.body.comment).toMatchObject({ body: "Works again after the update.", author: { id: requesterId, role: "REQUESTER" } });
    const comments = await prisma.publicComment.findMany({ where: { ticketId: withComment } });
    expect(comments.map((c) => [c.authorId, c.body])).toEqual([[requesterId, "Works again after the update."]]);

    // A comment over 2000 characters is refused, and nothing is recorded.
    const tooLong = (await ticketFor(requesterId, { currentStatus: "OPEN", ownerId: staffId })).id;
    const refused = await markResolved(tooLong, { comment: "c".repeat(2001) });
    expect(refused.status).toBe(400);
    expect(refused.body.error.fields.comment).toBeTruthy();
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tooLong } })).requesterResolvedAt).toBeNull();
  });

  it("REG-11 refuses marking again, and marking a RESOLVED, CLOSED, or CANCELLED ticket, with 409 ALREADY_MARKED", async () => {
    const marked = (await ticketFor(requesterId, { currentStatus: "OPEN", ownerId: staffId, requesterResolvedAt: new Date("2026-10-01T00:00:00Z") })).id;
    const again = await markResolved(marked, { comment: "Still fine" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_MARKED");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: marked } })).requesterResolvedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const id = (await ticketFor(requesterId, { currentStatus: status, ownerId: staffId })).id;
      const res = await markResolved(id, { comment: "Done?" });
      expect(res.status, status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_MARKED");
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id } })).toMatchObject({ requesterResolvedAt: null, currentStatus: status });
      expect(await prisma.publicComment.count({ where: { ticketId: id } })).toBe(0);
      expect((await request(app).get(`/api/tickets/${id}`).set("Cookie", cookies.requester)).body.canMarkAppearsResolved).toBe(false);
    }
    // NEW and REOPENED are allowed (BR-47).
    for (const status of ["NEW", "REOPENED"] as const) {
      const id = (await ticketFor(requesterId, { currentStatus: status, ownerId: status === "NEW" ? null : staffId })).id;
      expect((await markResolved(id)).status, status).toBe(200);
    }
  });

  it("REG-12 gives a Requester no way to change status: the staff route is 403, and status fields in their bodies are ignored", async () => {
    const id = (await ticketFor(requesterId, { currentStatus: "IN_PROGRESS", ownerId: staffId })).id;
    for (const status of ["RESOLVED", "CLOSED"] as const) {
      const res = await request(app)
        .patch(`/api/staff/tickets/${id}/status`)
        .set("Cookie", cookies.requester)
        .send({ status, expectedStatus: "IN_PROGRESS", expectedOwnerId: staffId, resolutionSummary: "I fixed it myself, honestly." });
      expect(res.status, status).toBe(403);
    }
    expect((await markResolved(id, { comment: "Looks resolved", status: "CLOSED", currentStatus: "RESOLVED" })).status).toBe(200);
    expect((await request(app).post(`/api/tickets/${id}/comments`).set("Cookie", cookies.requester).send({ body: "Closing it", status: "CLOSED", currentStatus: "CLOSED" })).status).toBe(201);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).currentStatus).toBe("IN_PROGRESS");
  });

  it("REG-13 answers another Requester's ticket with 404, exactly like a missing one", async () => {
    const theirs = (await ticketFor(otherRequesterId, { currentStatus: "IN_PROGRESS", ownerId: staffId })).id;
    const res = await markResolved(theirs);
    const missing = await markResolved(2_000_000_000);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(missing.body);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: theirs } })).requesterResolvedAt).toBeNull();
  });
});
