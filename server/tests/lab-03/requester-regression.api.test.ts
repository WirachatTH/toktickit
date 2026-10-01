import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// Requester regression on the Lab 3 schema (docs/lab-03/tests.md §2.4).
// Issue 2 adds the rows its schema change makes necessary (REG-04, REG-17);
// Issue 4 moves the Requester endpoints onto the session (REG-01, REG-02,
// REG-09); Issue 5 extends this file when the selector itself is removed.
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

describe("REG-17 staff accounts cannot act as Requesters through the Lab 2 selector", () => {
  it("leaves IT Staff and Administrators out of the Development Requester list", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    const ids = res.body.map((r: { id: number }) => r.id);
    expect(ids).toContain(requesterId);
    expect(ids).not.toContain(staffId);
    expect(ids).not.toContain(adminId);

    // And every listed account really is a Requester.
    const roles = await prisma.user.findMany({ where: { id: { in: ids } }, select: { role: true } });
    expect(new Set(roles.map((r) => r.role))).toEqual(new Set(["REQUESTER"]));
  });

  it("refuses an IT Staff or Administrator id in the dev header exactly like an unknown one", async () => {
    for (const id of [staffId, adminId]) {
      const list = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(id));
      expect(list.status, `GET as ${id}`).toBe(401);

      const create = await request(app)
        .post("/api/tickets")
        .set("X-Dev-Requester-Id", String(id))
        .field("categoryId", String(categoryId))
        .field("relatedSystemId", String(relatedSystemId))
        .field("summary", "Must never be created")
        .field("description", "A staff account must not be able to create a ticket as a Requester.");
      expect(create.status, `POST as ${id}`).toBe(401);
    }
    const unknown = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", "2147483646");
    expect(unknown.status).toBe(401);
    expect(await prisma.ticket.count({ where: { summary: "Must never be created" } })).toBe(0);
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
