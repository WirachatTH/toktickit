import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";

// Issue 8 — Requester Ticket Detail (docs/lab-02/specification.md BR-45,
// Decision D-2; api-spec.md §6). A Ticket not owned by the current
// Requester must be indistinguishable from a nonexistent one — every
// negative case here asserts the exact same 404 NOT_FOUND envelope with no
// ticket data anywhere in the body, not just a non-200 status.

const prisma = getPrisma();

const PNG_BASE = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082",
  "hex"
);

let ownerId: number;
let otherId: number;
let category: { id: number; name: string };
let system: { id: number; name: string };

function authHeader(requesterId: number) {
  return { "X-Dev-Requester-Id": String(requesterId) };
}

beforeAll(async () => {
  await seed(prisma);
  const requesters = await prisma.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 2 });
  [ownerId, otherId] = requesters.map((r) => r.id);
  category = await prisma.category.findFirstOrThrow();
  system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: "TCK-DETAIL-" } } });
});

async function createOwnedTicket(overrides: Partial<{ requesterId: number; summary: string }> = {}) {
  return prisma.ticket.create({
    data: {
      requesterId: overrides.requesterId ?? ownerId,
      categoryId: category.id,
      relatedSystemId: system.id,
      ticketNumber: `TCK-DETAIL-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      summary: overrides.summary ?? "Ticket Detail fixture ticket",
      description: "Fixture ticket created directly for Issue 8 ticket-detail tests.",
    },
  });
}

describe("GET /api/tickets/:id — ownership (API-19, BR-45)", () => {
  it("returns 200 with full data for the owning Requester", async () => {
    const ticket = await createOwnedTicket({ summary: "Laptop battery drains quickly" });

    const res = await request(app).get(`/api/tickets/${ticket.id}`).set(authHeader(ownerId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: "Laptop battery drains quickly",
      description: ticket.description,
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
      requester: { id: ownerId },
      category: { id: category.id, name: category.name },
      relatedSystem: { id: system.id, name: system.name },
      attachments: [],
    });
    expect(res.body.requester).not.toHaveProperty("isActive");
    expect(res.body.requester.email).toEqual(expect.any(String));
  });

  it("returns 404 with no ticket data for a Requester who does not own the Ticket", async () => {
    const ticket = await createOwnedTicket();

    const res = await request(app).get(`/api/tickets/${ticket.id}`).set(authHeader(otherId));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    // Not just the right status — the response body itself must carry
    // nothing ticket-shaped anywhere (the labsheet's explicit
    // "unauthorized ticket-access test").
    expect(JSON.stringify(res.body)).not.toContain(ticket.ticketNumber);
  });

  it("rejects with no X-Dev-Requester-Id header", async () => {
    const ticket = await createOwnedTicket();
    const res = await request(app).get(`/api/tickets/${ticket.id}`);
    expect(res.status).toBe(401);
  });

  it("includes both active and removed Attachments with the documented fields", async () => {
    const ticket = await createOwnedTicket();
    const uploaded = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(ownerId))
      .attach("file", PNG_BASE, "evidence.png");
    expect(uploaded.status).toBe(201);

    const removedUpload = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(ownerId))
      .attach("file", PNG_BASE, "old-screenshot.png");
    await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${removedUpload.body.id}/remove`)
      .set(authHeader(ownerId))
      .send({ reason: "Wrong screenshot, replaced by evidence.png." });

    const res = await request(app).get(`/api/tickets/${ticket.id}`).set(authHeader(ownerId));
    expect(res.status).toBe(200);
    expect(res.body.attachments).toHaveLength(2);

    const active = res.body.attachments.find((a: { id: number }) => a.id === uploaded.body.id);
    expect(active).toMatchObject({ originalFilename: "evidence.png", isRemoved: false, removedAt: null, removedReason: null });

    const removed = res.body.attachments.find((a: { id: number }) => a.id === removedUpload.body.id);
    expect(removed).toMatchObject({
      originalFilename: "old-screenshot.png",
      isRemoved: true,
      removedReason: "Wrong screenshot, replaced by evidence.png.",
    });
    expect(removed.removedAt).toEqual(expect.any(String));
  });

  // Every attachment created through the real upload route in the test
  // above lands on a distinct uploadedAt because Issue 6's row lock on the
  // Ticket serializes concurrent adds — so nothing exercises what happens
  // when two attachments genuinely tie. Created directly so the tie is
  // guaranteed rather than hoped-for.
  //
  // Honest limitation, found by mutation-testing this specific test: it
  // still passes with the `{ id: "asc" }` tiebreak removed entirely. For
  // freshly-inserted rows id is assigned in the same order the rows are
  // inserted, so an id-based tiebreak and Postgres's own incidental scan
  // order can never diverge in a test built this way — this assertion
  // proves the order is deterministic and matches insertion order, not
  // that the tiebreak clause is what's causing it. Kept anyway (the code
  // is correct on the merits: an ORDER BY with no fully-determining key
  // has no defined tie order per the SQL standard, regardless of what one
  // query happens to return today) and left in rather than deleted, so a
  // future change to this ordering still gets checked against something.
  it("returns a deterministic order for two attachments uploaded at the identical instant", async () => {
    const ticket = await createOwnedTicket();
    const tiedUploadedAt = new Date("2021-06-15T12:00:00.000Z");
    const makeTied = async (originalFilename: string) =>
      prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          originalFilename,
          storedFilename: `tie-${originalFilename}-${Math.random().toString(36).slice(2)}.png`,
          mimeType: "image/png",
          sizeBytes: 1024,
          uploadedAt: tiedUploadedAt,
        },
      });
    const first = await makeTied("first.png");
    const second = await makeTied("second.png");

    const res = await request(app).get(`/api/tickets/${ticket.id}`).set(authHeader(ownerId));
    expect(res.status).toBe(200);
    expect(res.body.attachments.map((a: { id: number }) => a.id)).toEqual([first.id, second.id]);
  });

  it("still shows the correct Category and Related System names after either is deactivated (a Ticket's own history doesn't change when the reference data does)", async () => {
    const deactivatableSystem = await prisma.relatedSystem.create({
      data: { name: `Deprecated System ${Date.now()}`, isActive: true },
    });
    const ticket = await createOwnedTicket();
    await prisma.ticket.update({ where: { id: ticket.id }, data: { relatedSystemId: deactivatableSystem.id } });

    await prisma.relatedSystem.update({ where: { id: deactivatableSystem.id }, data: { isActive: false } });
    try {
      const res = await request(app).get(`/api/tickets/${ticket.id}`).set(authHeader(ownerId));
      expect(res.status).toBe(200);
      expect(res.body.relatedSystem).toEqual({ id: deactivatableSystem.id, name: deactivatableSystem.name });
    } finally {
      // RelatedSystem<-Ticket is onDelete: Restrict — the system can only
      // be deleted once the ticket referencing it is gone first, not the
      // other way around.
      await prisma.ticket.delete({ where: { id: ticket.id } }).catch(() => {});
      await prisma.relatedSystem.delete({ where: { id: deactivatableSystem.id } }).catch(() => {});
    }
  });
});

describe("GET /api/tickets/:id — not-found and malformed id cases (API-20, API-21)", () => {
  it("returns a safe 404 for a nonexistent (but well-formed) ticket id", async () => {
    const res = await request(app).get("/api/tickets/999999").set(authHeader(ownerId));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  });

  it("returns a safe 404 for a non-numeric id, never a 500 or stack trace", async () => {
    const res = await request(app).get("/api/tickets/abc").set(authHeader(ownerId));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  });

  it("returns a safe 404 for an injection-shaped id, table stays intact", async () => {
    const res = await request(app)
      .get(`/api/tickets/${encodeURIComponent("1; DROP TABLE \"Ticket\"; --")}`)
      .set(authHeader(ownerId));
    expect(res.status).toBe(404);

    const stillThere = await prisma.category.findFirstOrThrow();
    expect(stillThere).toBeDefined();
  });

  it("returns a safe 404 for an id far outside Int32 range, not a 500 (same bug class as tests.md API-21/parsePositiveId)", async () => {
    const res = await request(app).get("/api/tickets/9999999999").set(authHeader(ownerId));
    expect(res.status).toBe(404);
  });

  it("returns a safe 404 for a negative id", async () => {
    const res = await request(app).get("/api/tickets/-1").set(authHeader(ownerId));
    expect(res.status).toBe(404);
  });

  it("returns a safe 404 for a decimal id", async () => {
    const res = await request(app).get("/api/tickets/1.5").set(authHeader(ownerId));
    expect(res.status).toBe(404);
  });

  it("returns a safe 404 for a well-formed id exactly at the Int32 maximum (2147483647), nonexistent but not rejected by validation", async () => {
    const res = await request(app).get("/api/tickets/2147483647").set(authHeader(ownerId));
    expect(res.status).toBe(404);
  });

  it("returns a safe 404 for an id containing an encoded path separator, not a routing error", async () => {
    const res = await request(app).get(`/api/tickets/${encodeURIComponent("1/2")}`).set(authHeader(ownerId));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tickets/ — trailing slash, no id at all", () => {
  // Not a bug: Express's default router is trailing-slash-insensitive, so
  // this actually matches the Issue 7 list route (GET /api/tickets), not
  // this file's detail route — and the list route already scopes safely to
  // the caller. Locked in as a regression test precisely because it's easy
  // to assume a trailing-slash request 404s the way an empty/malformed id
  // would, when it silently hits a completely different, differently-shaped
  // endpoint instead.
  it("hits the ticket list endpoint, not a ticket-detail 404, and still responds safely", async () => {
    const res = await request(app).get("/api/tickets/").set(authHeader(ownerId));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pagination");
    expect(res.body).not.toHaveProperty("ticketNumber");
  });
});
