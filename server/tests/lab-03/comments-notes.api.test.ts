import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Role } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// API-18 to API-28 — Public Comments and Internal Notes (docs/lab-03/api-spec.md
// §4, specification.md BR-04, BR-25, BR-49 to BR-52, BR-80).
//
// Every user and ticket here is created by this file and removed afterwards
// (D-22); comments and notes cascade with their tickets.

const prisma = getPrisma();
const stamp = Date.now();

const users = {} as Record<"requester" | "other" | "staff" | "admin", { id: number; name: string; role: Role }>;
const cookies = {} as Record<keyof typeof users, string>;
const ticketIds: number[] = [];
let category: number;
let system: number;

async function makeTicket(owner: number, status: "NEW" | "IN_PROGRESS" | "CLOSED" | "CANCELLED" = "NEW") {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `CMT-${stamp}-${ticketIds.length}`,
      requesterId: owner,
      categoryId: category,
      relatedSystemId: system,
      summary: "Comments and notes fixture",
      description: "Created by the Lab 3 comments and notes suite.",
      itPriority: "MEDIUM",
      currentStatus: status,
    },
  });
  ticketIds.push(ticket.id);
  return ticket.id;
}

const comments = (t: number) => `/api/tickets/${t}/comments`;
const notes = (t: number) => `/api/tickets/${t}/internal-notes`;
const post = (path: string, who: keyof typeof users, body: unknown) => request(app).post(path).set("Cookie", cookies[who]).send(body as object);
const get = (path: string, who: keyof typeof users) => request(app).get(path).set("Cookie", cookies[who]);
const person = (who: keyof typeof users) => ({ id: users[who].id, name: users[who].name, role: users[who].role, isActive: true });

beforeAll(async () => {
  category = (await prisma.category.findFirstOrThrow()).id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const make = async (key: keyof typeof users, role: Role) => {
    const name = `Comments ${key} ${stamp}`;
    const user = await prisma.user.create({
      data: { name, email: `comments.${key}.${stamp}@kmutt.ac.th`, role, mustChangePassword: false },
    });
    users[key] = { id: user.id, name, role };
    cookies[key] = await sessionCookieFor(prisma, user.id);
  };
  await make("requester", "REQUESTER");
  await make("other", "REQUESTER");
  await make("staff", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
});

describe("Public Comments", () => {
  it("API-18 a Requester comments on their own ticket; the server sets the author, and IT Staff see it", async () => {
    const ticket = await makeTicket(users.requester.id);
    const res = await post(comments(ticket), "requester", { body: "  The laptop still restarts every hour.  " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), body: "The laptop still restarts every hour.", createdAt: expect.any(String), author: person("requester") });

    for (const who of ["requester", "staff", "admin"] as const) {
      const list = await get(comments(ticket), who);
      expect(list.status, who).toBe(200);
      expect(list.body.data.map((c: { id: number }) => c.id), who).toEqual([res.body.id]);
    }
    // Another Requester's ticket is not found, for reading and for posting (BR-24).
    expect((await get(comments(ticket), "other")).status).toBe(404);
    expect((await post(comments(ticket), "other", { body: "Not my ticket" })).status).toBe(404);
    expect(await prisma.publicComment.count({ where: { ticketId: ticket } })).toBe(1);
  });

  it("API-19 IT Staff comment on any ticket and its Requester sees it", async () => {
    const ticket = await makeTicket(users.requester.id);
    const res = await post(comments(ticket), "staff", { body: "Could you restart the laptop and try again?" });
    expect(res.status).toBe(201);
    expect(res.body.author).toEqual(person("staff"));
    const seen = await get(comments(ticket), "requester");
    expect(seen.body.data).toEqual([res.body]);
  });
});

describe("bodies (BR-50)", () => {
  it("API-20 accepts 1 and 2000 characters after trimming, and rejects empty, whitespace-only, and 2001 on fields.body", async () => {
    const ticket = await makeTicket(users.requester.id);
    for (const [path, who] of [[comments(ticket), "staff"], [notes(ticket), "staff"]] as const) {
      for (const ok of ["x", "y".repeat(2000), ` ${"z".repeat(2000)} `]) {
        const res = await post(path, who, { body: ok });
        expect(res.status, `${path} ${ok.length}`).toBe(201);
        expect(res.body.body.length).toBe(ok.trim().length);
      }
      for (const bad of ["", "   \n\t  ", "w".repeat(2001), undefined, 42]) {
        const res = await post(path, who, bad === undefined ? {} : { body: bad });
        expect(res.status, `${path} ${JSON.stringify(bad)?.slice(0, 20)}`).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
        expect(res.body.error.fields.body).toBeTruthy();
      }
    }
    expect(await prisma.publicComment.count({ where: { ticketId: ticket } })).toBe(3);
    expect(await prisma.internalNote.count({ where: { ticketId: ticket } })).toBe(3);
  });

  it("API-21 ignores a client-supplied author and creation time", async () => {
    const ticket = await makeTicket(users.requester.id);
    const before = Date.now();
    for (const path of [comments(ticket), notes(ticket)]) {
      const who = path === comments(ticket) ? "requester" : "staff";
      const res = await post(path, who, {
        body: "Who wrote this?",
        authorId: users.admin.id,
        author: { id: users.admin.id, name: "Forged" },
        createdAt: "2001-01-01T00:00:00.000Z",
      });
      expect(res.status, path).toBe(201);
      expect(res.body.author.id).toBe(users[who].id);
      expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
    const stored = await prisma.publicComment.findFirstOrThrow({ where: { ticketId: ticket } });
    expect(stored.authorId).toBe(users.requester.id);
    expect(stored.createdAt.getUTCFullYear()).not.toBe(2001);
  });
});

describe("append-only (BR-51)", () => {
  it("API-22 has no route to edit or delete a comment or a note", async () => {
    const ticket = await makeTicket(users.requester.id);
    const comment = (await post(comments(ticket), "staff", { body: "Keep me" })).body.id;
    const note = (await post(notes(ticket), "staff", { body: "Keep me too" })).body.id;
    for (const path of [comments(ticket), `${comments(ticket)}/${comment}`, notes(ticket), `${notes(ticket)}/${note}`]) {
      for (const method of ["put", "patch", "delete"] as const) {
        const res = await request(app)[method](path).set("Cookie", cookies.staff).send({ body: "Edited" });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    }
    expect((await prisma.publicComment.findUniqueOrThrow({ where: { id: comment } })).body).toBe("Keep me");
    expect((await prisma.internalNote.findUniqueOrThrow({ where: { id: note } })).body).toBe("Keep me too");
  });
});

describe("Internal Notes", () => {
  it("API-23 IT Staff post a note; IT Staff and Administrators read it", async () => {
    const ticket = await makeTicket(users.requester.id);
    const res = await post(notes(ticket), "staff", { body: "Battery is from the recalled batch." });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), body: "Battery is from the recalled batch.", createdAt: expect.any(String), author: person("staff") });
    for (const who of ["staff", "admin"] as const) {
      const list = await get(notes(ticket), who);
      expect(list.status, who).toBe(200);
      expect(list.body.data).toEqual([res.body]);
    }
  });

  it("API-24 leaves no trace of a note in anything the Requester can fetch", async () => {
    const ticket = await makeTicket(users.requester.id);
    const SECRET = `internal-secret-${stamp}`;
    expect((await post(notes(ticket), "staff", { body: SECRET })).status).toBe(201);
    expect((await post(comments(ticket), "staff", { body: "A public reply" })).status).toBe(201);

    const responses = [
      await get(`/api/tickets/${ticket}`, "requester"),
      await get(`/api/tickets?pageSize=50`, "requester"),
      await get(comments(ticket), "requester"),
      await get(notes(ticket), "requester"),
      await post(notes(ticket), "requester", { body: "Let me in" }),
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 403, 403]);
    for (const res of responses) {
      expect(res.text).not.toContain(SECRET);
      expect(res.text).not.toMatch(/internalNote|noteCount|"notes"/i);
    }
    // The two refusals are the bare envelope, identical to a ticket that does not exist (BR-25).
    expect(responses[3].body).toEqual((await get(notes(2_000_000_000), "requester")).body);
    expect(await prisma.internalNote.count({ where: { ticketId: ticket } })).toBe(1);
  });
});

describe("closed tickets and Last Updated (BR-52, BR-80)", () => {
  it("API-25 refuses a comment on CLOSED and CANCELLED with 409 TICKET_CLOSED, but accepts a note", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const ticket = await makeTicket(users.requester.id, status);
      for (const who of ["requester", "staff"] as const) {
        const res = await post(comments(ticket), who, { body: "One more thing" });
        expect(res.status, `${who} on ${status}`).toBe(409);
        expect(res.body.error.code).toBe("TICKET_CLOSED");
      }
      expect((await post(notes(ticket), "staff", { body: "Follow-up for the record" })).status).toBe(201);
      expect(await prisma.publicComment.count({ where: { ticketId: ticket } })).toBe(0);
      // The Requester's detail says so, for the composer (api-spec §3.3).
      expect((await get(`/api/tickets/${ticket}`, "requester")).body.canComment).toBe(false);
    }
    const open = await makeTicket(users.requester.id, "IN_PROGRESS");
    expect((await get(`/api/tickets/${open}`, "requester")).body.canComment).toBe(true);
  });

  it("API-26 advances the ticket's updatedAt when a comment or a note is posted", async () => {
    const ticket = await makeTicket(users.requester.id);
    for (const [path, who] of [[comments(ticket), "requester"], [notes(ticket), "staff"]] as const) {
      const old = new Date("2026-01-01T00:00:00.000Z");
      await prisma.ticket.update({ where: { id: ticket }, data: { updatedAt: old } });
      expect((await post(path, who, { body: "Touching the ticket" })).status).toBe(201);
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket } });
      expect(after.updatedAt.getTime(), path).toBeGreaterThan(old.getTime());
    }
  });
});

describe("ordering and safe text (BR-51)", () => {
  it("API-27 lists oldest first with an id tiebreak, and returns a <script> body verbatim", async () => {
    const ticket = await makeTicket(users.requester.id);
    const same = new Date("2026-10-01T08:00:00.000Z");
    const later = await prisma.publicComment.create({ data: { ticketId: ticket, authorId: users.staff.id, body: "third", createdAt: new Date("2026-10-01T09:00:00.000Z") } });
    const a = await prisma.publicComment.create({ data: { ticketId: ticket, authorId: users.staff.id, body: "first", createdAt: same } });
    const b = await prisma.publicComment.create({ data: { ticketId: ticket, authorId: users.requester.id, body: "second", createdAt: same } });
    const list = await get(comments(ticket), "requester");
    expect(list.body.data.map((c: { id: number }) => c.id)).toEqual([a.id, b.id, later.id]);

    const n1 = await prisma.internalNote.create({ data: { ticketId: ticket, authorId: users.staff.id, body: "later note", createdAt: new Date("2026-10-01T09:00:00.000Z") } });
    const n0 = await prisma.internalNote.create({ data: { ticketId: ticket, authorId: users.staff.id, body: "earlier note", createdAt: same } });
    expect((await get(notes(ticket), "staff")).body.data.map((n: { id: number }) => n.id)).toEqual([n0.id, n1.id]);

    const unsafe = `<script>alert("x")</script><img src=x onerror="alert(1)">`;
    const posted = await post(comments(ticket), "requester", { body: unsafe });
    expect(posted.status).toBe(201);
    expect(posted.body.body).toBe(unsafe);
    expect((await get(comments(ticket), "staff")).body.data.at(-1).body).toBe(unsafe);
  });
});

describe("Administrators read but do not post (BR-21)", () => {
  it("API-28 lets an Administrator read comments and notes, and refuses both posts with 403", async () => {
    const ticket = await makeTicket(users.requester.id);
    await post(comments(ticket), "staff", { body: "Visible to everyone" });
    await post(notes(ticket), "staff", { body: "Visible to staff" });
    expect((await get(comments(ticket), "admin")).body.data).toHaveLength(1);
    expect((await get(notes(ticket), "admin")).body.data).toHaveLength(1);
    for (const path of [comments(ticket), notes(ticket)]) {
      const res = await post(path, "admin", { body: "An Administrator must not post this" });
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await prisma.publicComment.count({ where: { ticketId: ticket } })).toBe(1);
    expect(await prisma.internalNote.count({ where: { ticketId: ticket } })).toBe(1);
  });
});
