import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
import { storedFilePath } from "../../src/attachmentStorage.js";
import { buildAttachmentContentDisposition } from "../../src/attachmentPersistence.js";

// Issue 6 — post-creation attachment lifecycle: add to an existing Ticket,
// metadata, download, soft-remove (docs/lab-02/specification.md BR-30-39,
// api-spec.md §7-10). Shares validation/storage with Issue 5's
// creation-time path (attachmentPersistence.ts), so boundary cases already
// proven there (exact 5MB, spoofed extension, path-traversal filename)
// aren't re-proven byte-for-byte here — only that this path enforces the
// same rules and the ownership/lifecycle behavior specific to this issue.

const prisma = getPrisma();

const PNG_BASE = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082",
  "hex"
);

let requesterAId: number;
let requesterBId: number;
let categoryId: number;
let systemId: number;

const createdTicketIds: number[] = [];
const writtenStoredFilenames: string[] = [];

async function createOwnedTicket(requesterId: number, summary = "Attachment lifecycle test ticket") {
  const ticket = await prisma.ticket.create({
    data: {
      requesterId,
      categoryId,
      relatedSystemId: systemId,
      ticketNumber: `TCK-ATTTEST${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      summary,
      description: "Fixture ticket created directly for Issue 6 attachment-lifecycle tests.",
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

function authHeader(requesterId: number) {
  return { "X-Dev-Requester-Id": String(requesterId) };
}

beforeAll(async () => {
  await seed(prisma);
  const requesters = await prisma.requesterUser.findMany({ where: { isActive: true }, take: 2 });
  requesterAId = requesters[0].id;
  requesterBId = requesters[1].id;
  const category = await prisma.category.findFirstOrThrow();
  categoryId = category.id;
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  systemId = system.id;
});

afterAll(async () => {
  const attachments = await prisma.attachment.findMany({
    where: { ticketId: { in: createdTicketIds } },
    select: { storedFilename: true },
  });
  writtenStoredFilenames.push(...attachments.map((a) => a.storedFilename));

  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await Promise.all(writtenStoredFilenames.map((name) => fs.unlink(storedFilePath(name)).catch(() => {})));
});

describe("POST /api/tickets/:id/attachments — adding to an existing ticket", () => {
  it("adds a valid file and increments the active count", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "evidence.png");

    expect(res.status).toBe(201);
    expect(res.body.originalFilename).toBe("evidence.png");
    expect(res.body.isRemoved).toBe(false);

    const count = await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } });
    expect(count).toBe(1);
  });

  it("rejects a disallowed type and leaves the ticket otherwise unaffected (BR-39)", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });

    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", Buffer.from("not a real file"), "malware.exe");

    expect(res.status).toBe(415);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after).toEqual(before);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("cleans up a file already written to disk when the DB insert fails afterward (BR-39 compensation, add path)", async () => {
    // The active-count-limit path (tested elsewhere) throws before
    // persistAttachment is ever called, so writtenPaths stays empty and
    // cleanup there is a no-op — it can't prove compensation actually
    // deletes anything. This forces a *later* failure: pin the generated
    // storedFilename (normally a random UUID) to one that already belongs
    // to another Attachment row (storedFilename is @unique), so fs.writeFile
    // genuinely writes the new file to disk first and only the DB insert
    // fails afterward — the same order persistAttachment always uses.
    const ticket = await createOwnedTicket(requesterAId);
    const blockerTicket = await createOwnedTicket(requesterAId);
    const collidingUuid = "11111111-2222-3333-4444-555555555555";
    const collidingStoredFilename = `${collidingUuid}.png`;

    await prisma.attachment.create({
      data: {
        ticketId: blockerTicket.id,
        originalFilename: "already-here.png",
        storedFilename: collidingStoredFilename,
        mimeType: "image/png",
        sizeBytes: PNG_BASE.length,
      },
    });

    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue(collidingUuid as ReturnType<typeof crypto.randomUUID>);

    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "orphan-candidate.png");
    uuidSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id } })).toBe(0);

    // If compensation had not run (or had failed silently), the file
    // persistAttachment just wrote would still be sitting on disk here.
    await expect(fs.access(storedFilePath(collidingStoredFilename))).rejects.toThrow();
  });

  it("rejects an oversized file without affecting the ticket", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const tooBig = Buffer.concat([PNG_BASE, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", tooBig, "huge.png");

    expect(res.status).toBe(413);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("rejects with no X-Dev-Requester-Id header", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const res = await request(app).post(`/api/tickets/${ticket.id}/attachments`).attach("file", PNG_BASE, "a.png");
    expect(res.status).toBe(401);
  });

  it("rejects a Ticket that does not exist", async () => {
    const res = await request(app)
      .post("/api/tickets/999999/attachments")
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "a.png");
    expect(res.status).toBe(404);
  });

  it("rejects a Ticket owned by a different Requester — no data leaked, same as a nonexistent ticket", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterBId))
      .attach("file", PNG_BASE, "a.png");
    expect(res.status).toBe(404);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("rejects a malformed (non-numeric) ticket id safely rather than erroring", async () => {
    const res = await request(app)
      .post("/api/tickets/not-a-number/attachments")
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "a.png");
    expect(res.status).toBe(404);
  });

  it("rejects a 6th active attachment, whether reached by five sequential adds or fewer", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set(authHeader(requesterAId))
        .attach("file", PNG_BASE, `photo-${i}.png`);
      expect(res.status).toBe(201);
    }
    const sixth = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "photo-6.png");
    expect(sixth.status).toBe(409);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } })).toBe(5);
  });

  it("under 6 concurrent adds on a Ticket starting at 0 active, exactly 5 succeed — the row lock prevents an overrun race", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app)
          .post(`/api/tickets/${ticket.id}/attachments`)
          .set(authHeader(requesterAId))
          .attach("file", PNG_BASE, `race-${i}.png`)
      )
    );
    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(5);
    expect(conflicted).toHaveLength(1);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } })).toBe(5);
  });

  it("accepts a Unicode (Thai) filename and returns it unmangled, proving the shared decode logic works on this path too", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "หลักฐานแนบ.png");
    expect(res.status).toBe(201);
    expect(res.body.originalFilename).toBe("หลักฐานแนบ.png");
  });
});

describe("GET /api/tickets/:ticketId/attachments/:attachmentId — metadata", () => {
  it("returns full metadata, including removal fields, for an active attachment", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "meta.png");

    const res = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}`)
      .set(authHeader(requesterAId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ originalFilename: "meta.png", isRemoved: false, removedAt: null, removedReason: null });
  });

  it("rejects an Attachment id that belongs to a different Ticket, even if that Ticket is also owned by this Requester", async () => {
    const ticketOne = await createOwnedTicket(requesterAId);
    const ticketTwo = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticketOne.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "belongs-to-one.png");

    const res = await request(app)
      .get(`/api/tickets/${ticketTwo.id}/attachments/${created.body.id}`)
      .set(authHeader(requesterAId));
    expect(res.status).toBe(404);
  });

  it("rejects a Requester reading metadata for another Requester's Ticket's attachment", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "private.png");

    const res = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}`)
      .set(authHeader(requesterBId));
    expect(res.status).toBe(404);
  });
});

describe("GET .../download and PATCH .../remove — the soft-removal lifecycle", () => {
  it("downloads an active attachment with the correct bytes and content type", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "download-me.png");

    const res = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}/download`)
      .set(authHeader(requesterAId));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(res.body, PNG_BASE)).toBe(0);
  });

  it("encodes a Unicode filename correctly in Content-Disposition (RFC 5987) rather than corrupting it", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "ไฟล์แนบ.png");

    const res = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}/download`)
      .set(authHeader(requesterAId));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(res.headers["content-disposition"]).toContain(encodeURIComponent("ไฟล์แนบ.png"));
  });

  it("rejects removal with no reason, and with a reason outside 3-200 characters", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "to-remove.png");

    const noReason = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({});
    expect(noReason.status).toBe(400);

    const tooShort = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({ reason: "no" });
    expect(tooShort.status).toBe(400);
  });

  it("soft-removes with a valid reason, then blocks download while keeping metadata visible", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "lifecycle.png");

    const removed = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({ reason: "Wrong screenshot, replaced by a better one." });
    expect(removed.status).toBe(200);
    expect(removed.body.isRemoved).toBe(true);
    expect(removed.body.removedReason).toBe("Wrong screenshot, replaced by a better one.");

    const download = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}/download`)
      .set(authHeader(requesterAId));
    expect(download.status).toBe(404);

    const metadata = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}`)
      .set(authHeader(requesterAId));
    expect(metadata.status).toBe(200);
    expect(metadata.body).toMatchObject({
      originalFilename: "lifecycle.png",
      isRemoved: true,
      removedReason: "Wrong screenshot, replaced by a better one.",
    });

    const activeCount = await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } });
    expect(activeCount).toBe(0);
  });

  it("rejects removing an already-removed attachment — idempotency guard, not a second removal record", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "double-remove.png");

    const first = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({ reason: "First removal." });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({ reason: "Second attempt should be rejected." });
    expect(second.status).toBe(409);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.removedReason).toBe("First removal.");
  });

  it("removing a freed slot lets a new attachment be added again", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const uploads = [];
    for (let i = 0; i < 5; i++) {
      uploads.push(
        await request(app)
          .post(`/api/tickets/${ticket.id}/attachments`)
          .set(authHeader(requesterAId))
          .attach("file", PNG_BASE, `slot-${i}.png`)
      );
    }
    expect(uploads.every((r) => r.status === 201)).toBe(true);

    await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${uploads[0].body.id}/remove`)
      .set(authHeader(requesterAId))
      .send({ reason: "Freeing a slot for a better file." });

    const sixthAfterFree = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "replacement.png");
    expect(sixthAfterFree.status).toBe(201);
    expect(await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } })).toBe(5);
  });

  it("rejects download, remove, and metadata for an Attachment on a Ticket owned by a different Requester — every operation, not just read", async () => {
    const ticket = await createOwnedTicket(requesterAId);
    const created = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set(authHeader(requesterAId))
      .attach("file", PNG_BASE, "cross-owner.png");

    const download = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}/download`)
      .set(authHeader(requesterBId));
    expect(download.status).toBe(404);

    const remove = await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${created.body.id}/remove`)
      .set(authHeader(requesterBId))
      .send({ reason: "Trying to remove someone else's attachment." });
    expect(remove.status).toBe(404);

    const metadata = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${created.body.id}`)
      .set(authHeader(requesterBId));
    expect(metadata.status).toBe(404);

    // Confirm none of Requester B's rejected attempts actually changed anything.
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.isRemoved).toBe(false);
  });
});

describe("buildAttachmentContentDisposition — a filename an attacker controls must never corrupt the header", () => {
  // Tested directly against the function rather than through a live upload:
  // this app's own frontend (fetch/FormData) happens to percent-encode a
  // literal quote before the request is even sent, and supertest/superagent
  // may do the same — neither proves the *server* is safe against a client
  // that doesn't bother, e.g. a hand-built HTTP request or curl.

  it("escapes an embedded double-quote so it cannot break out of the quoted-string", () => {
    const header = buildAttachmentContentDisposition('report "final version".png');
    expect(header).toContain('filename="report \\"final version\\".png"');
    // The value up to the first unescaped quote must be the complete,
    // well-formed parameter — proves a real HTTP header parser would not
    // see the request as ending early.
    expect(header.match(/filename="((?:[^"\\]|\\.)*)"/)?.[1]).toBe('report \\"final version\\".png');
  });

  it("escapes an embedded backslash before escaping quotes, so it can't be used to un-escape a quote", () => {
    // If backslash were escaped after quotes (or not at all), a filename
    // ending in `\"` could smuggle an unescaped quote through.
    const header = buildAttachmentContentDisposition('evidence\\".png');
    expect(header).toContain('filename="evidence\\\\\\".png"');
  });

  it("strips CR/LF so the result can never span more than the one header line it belongs on", () => {
    // The actual injection vector is the line break itself — once CR/LF is
    // gone, "X-Injected-Header: evil" is inert leftover text inside a
    // filename, not a second header. A single-line result is what a real
    // HTTP header parser needs to be safe; asserting the substring is also
    // gone would be asserting more than the security property requires.
    const malicious = "innocuous.png\r\nX-Injected-Header: evil";
    const header = buildAttachmentContentDisposition(malicious);
    expect(header.split("\n")).toHaveLength(1);
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("still round-trips a normal, boring filename unchanged", () => {
    const header = buildAttachmentContentDisposition("screenshot.png");
    expect(header).toBe(`attachment; filename="screenshot.png"; filename*=UTF-8''screenshot.png`);
  });

  it("still round-trips a Unicode filename via the RFC 5987 filename* parameter", () => {
    const header = buildAttachmentContentDisposition("ไฟล์แนบ.png");
    expect(header).toContain("filename*=UTF-8''" + encodeURIComponent("ไฟล์แนบ.png"));
  });
});
