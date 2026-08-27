import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
import { formatTicketNumber } from "../../src/ticketNumber.js";
import { storedFilePath } from "../../src/attachmentStorage.js";

// Issue 5 — Create Ticket (docs/lab-02/specification.md §4/§8.3, BR-01,
// BR-05, BR-20-BR-26, BR-30-BR-33, BR-38; api-spec.md §4).
// Attachment upload at creation time lives here per the Issue 5 scope
// revision recorded in issues.md — see that file for why.

const prisma = getPrisma();

// A minimal but genuinely valid PNG (signature + IHDR + IEND), used as a
// base so byte-exact size fixtures still pass real content-type detection —
// file-type only needs to read the header, not the whole buffer.
const PNG_BASE = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082",
  "hex"
);
const PDF_BASE = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "latin1");
const FIVE_MB = 5 * 1024 * 1024;

function pngOfSize(totalBytes: number): Buffer {
  return Buffer.concat([PNG_BASE, Buffer.alloc(Math.max(totalBytes - PNG_BASE.length, 0))]);
}

let activeRequesterId: number;
let inactiveRequesterId: number;
let categoryId: number;
let activeSystemId: number;
let inactiveSystemId: number;

const createdTicketIds: number[] = [];
const writtenStoredFilenames: string[] = [];

async function trackAndCleanupTicket(ticketId: number) {
  createdTicketIds.push(ticketId);
  const attachments = await prisma.attachment.findMany({ where: { ticketId }, select: { storedFilename: true } });
  for (const a of attachments) writtenStoredFilenames.push(a.storedFilename);
}

beforeAll(async () => {
  await seed(prisma);
  const requester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
  activeRequesterId = requester.id;
  const inactive = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: false } });
  inactiveRequesterId = inactive.id;
  const category = await prisma.category.findFirstOrThrow();
  categoryId = category.id;
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  activeSystemId = system.id;

  const inactiveSystem = await prisma.relatedSystem.create({
    data: { name: `Decommissioned Create-Ticket-Test System ${Date.now()}`, isActive: false },
  });
  inactiveSystemId = inactiveSystem.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } }); // cascades Attachment rows
  }
  await prisma.relatedSystem.delete({ where: { id: inactiveSystemId } });
  await Promise.all(writtenStoredFilenames.map((name) => fs.unlink(storedFilePath(name)).catch(() => {})));
});

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: String(categoryId),
    relatedSystemId: String(activeSystemId),
    summary: "Laptop battery drains quickly",
    description: "The battery drops from 100% to 20% within an hour of unplugging the charger.",
    ...overrides,
  };
}

describe("POST /api/tickets — valid creation", () => {
  it("creates a ticket, generates a backend TCK-###### number, and assigns the selected requester", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody());

    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);

    expect(res.body.ticketNumber).toBe(formatTicketNumber(res.body.id));
    expect(res.body.requesterId).toBe(activeRequesterId);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.attachments).toEqual([]);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.ticketNumber).toBe(res.body.ticketNumber);
    expect(row.requesterId).toBe(activeRequesterId);
  });

  it("defaults requestedPriority to MEDIUM when omitted", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody());
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.requestedPriority).toBe("MEDIUM");
  });

  it("accepts an explicit requestedPriority", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ requestedPriority: "HIGH" }));
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.requestedPriority).toBe("HIGH");
  });

  it("succeeds with zero attachments — they are optional", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody());
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments).toHaveLength(0);
  });

  it("stores a <script> payload in Description safely, returned verbatim rather than silently mangled", async () => {
    const payload = "<script>alert('xss')</script> and some normal text besides it to satisfy the length minimum.";
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ description: payload }));
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    // Stored as data, not executed — the API is JSON, never HTML. Escaping
    // on render is the client's job (verified in CreateTicket.test.tsx);
    // here we only confirm the API doesn't corrupt or strip the value.
    expect(res.body.description).toBe(payload);
  });

  it("two rapid concurrent creations both succeed with distinct ticketNumbers (BR-01 race safety)", async () => {
    const [a, b] = await Promise.all([
      request(app).post("/api/tickets").set("X-Dev-Requester-Id", String(activeRequesterId)).field(validBody()),
      request(app).post("/api/tickets").set("X-Dev-Requester-Id", String(activeRequesterId)).field(validBody()),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    await trackAndCleanupTicket(a.body.id);
    await trackAndCleanupTicket(b.body.id);
    expect(a.body.ticketNumber).not.toBe(b.body.ticketNumber);
  });
});

describe("POST /api/tickets — field validation (BR-20/21/22/23/26)", () => {
  it("rejects a missing Summary with a field-level message, no row created", async () => {
    const before = await prisma.ticket.count();
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.summary).toBeTruthy();
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("rejects a whitespace-only Summary as empty after trimming", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "     " }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.summary).toBeTruthy();
  });

  it("Summary boundary: 4 chars rejected, 5 accepted, 120 accepted, 121 rejected", async () => {
    const four = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "abcd" }));
    expect(four.status).toBe(400);

    const five = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "abcde" }));
    expect(five.status).toBe(201);
    await trackAndCleanupTicket(five.body.id);

    const oneTwenty = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "a".repeat(120) }));
    expect(oneTwenty.status).toBe(201);
    await trackAndCleanupTicket(oneTwenty.body.id);

    const oneTwentyOne = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ summary: "a".repeat(121) }));
    expect(oneTwentyOne.status).toBe(400);
  });

  it("Description boundary: 19 chars rejected, 20 accepted, 2000 accepted, 2001 rejected", async () => {
    const nineteen = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ description: "a".repeat(19) }));
    expect(nineteen.status).toBe(400);

    const twenty = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ description: "a".repeat(20) }));
    expect(twenty.status).toBe(201);
    await trackAndCleanupTicket(twenty.body.id);

    const twoThousand = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ description: "a".repeat(2000) }));
    expect(twoThousand.status).toBe(201);
    await trackAndCleanupTicket(twoThousand.body.id);

    const twoThousandOne = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ description: "a".repeat(2001) }));
    expect(twoThousandOne.status).toBe(400);
  });

  it("rejects a nonexistent Category", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ categoryId: "999999" }));
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent Related System", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ relatedSystemId: "999999" }));
    expect(res.status).toBe(400);
  });

  it("rejects an inactive Related System, even though its id is real", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ relatedSystemId: String(inactiveSystemId) }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-enum requestedPriority sent directly, bypassing the UI's own constrained dropdown", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody({ requestedPriority: "URGENT!!" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/tickets — Requester authentication (testing-only, BR-07/BR-10)", () => {
  it("rejects a request with no X-Dev-Requester-Id header", async () => {
    const res = await request(app).post("/api/tickets").field(validBody());
    expect(res.status).toBe(401);
  });

  it("rejects a nonexistent requesterId", async () => {
    const res = await request(app).post("/api/tickets").set("X-Dev-Requester-Id", "999999").field(validBody());
    expect(res.status).toBe(401);
  });

  it("rejects an inactive requesterId", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(inactiveRequesterId))
      .field(validBody());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tickets — attachments at creation time (BR-30/31/32/33/38)", () => {
  it("accepts a valid PNG and a valid PDF together", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "photo.png")
      .attach("attachments", PDF_BASE, "report.pdf");
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments).toHaveLength(2);
    const mimeTypes = res.body.attachments.map((a: { mimeType: string }) => a.mimeType).sort();
    expect(mimeTypes).toEqual(["application/pdf", "image/png"]);
  });

  it("accepts a file at exactly 5 MB", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", pngOfSize(FIVE_MB), "exactly-5mb.png");
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments[0].sizeBytes).toBe(FIVE_MB);
  });

  it("rejects a file at 5 MB + 1 byte with 413, and creates no ticket at all", async () => {
    const before = await prisma.ticket.count();
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", pngOfSize(FIVE_MB + 1), "too-big.png");
    expect(res.status).toBe(413);
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("rejects a disallowed-but-detectable type (GIF) with 415", async () => {
    const gif = Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b", "hex");
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", gif, "animation.gif");
    expect(res.status).toBe(415);
  });

  it("rejects a spoofed extension — undetectable content named as if it were a permitted type", async () => {
    const notAnImage = Buffer.from("This is plain text pretending to be a photo, padded a bit further.", "utf-8");
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", notAnImage, "totally-a-photo.png");
    expect(res.status).toBe(415);
  });

  it("rejects an empty (0-byte) file rather than crashing or silently storing a broken attachment", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", Buffer.alloc(0), "empty.png");
    expect(res.status).toBe(415);
  });

  it("accepts a Unicode filename (Thai script) and returns it unmangled", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "ภาพหน้าจอ_ปัญหา.png");
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments[0].originalFilename).toBe("ภาพหน้าจอ_ปัญหา.png");
  });

  it("accepts two attachments that share the exact same original filename — a real scenario (two screenshots both named screenshot.png)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "screenshot.png")
      .attach("attachments", pngOfSize(2048), "screenshot.png");
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments).toHaveLength(2);
    expect(res.body.attachments.map((a: { originalFilename: string }) => a.originalFilename)).toEqual([
      "screenshot.png",
      "screenshot.png",
    ]);

    const rows = await prisma.attachment.findMany({ where: { ticketId: res.body.id } });
    // Distinct on-disk names despite the identical display name — no collision.
    expect(new Set(rows.map((r) => r.storedFilename)).size).toBe(2);
  });

  it("rejects a 6th attachment on a single new ticket, creating nothing", async () => {
    const before = await prisma.ticket.count();
    let req = request(app).post("/api/tickets").set("X-Dev-Requester-Id", String(activeRequesterId)).field(validBody());
    for (let i = 0; i < 6; i++) {
      req = req.attach("attachments", PNG_BASE, `photo-${i}.png`);
    }
    const res = await req;
    expect(res.status).toBe(400);
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("stores a path-traversal filename safely — metadata keeps the original name, storage uses a generated safe one", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "../../etc/passwd.png");
    expect(res.status).toBe(201);
    await trackAndCleanupTicket(res.body.id);
    expect(res.body.attachments[0].originalFilename).toContain("passwd.png");

    const row = await prisma.attachment.findFirstOrThrow({ where: { ticketId: res.body.id } });
    expect(row.storedFilename).not.toContain("..");
    expect(row.storedFilename).not.toContain("/");
  });

  it("rolls back the whole creation if the first attachment's write fails — no orphaned Ticket or Attachment row (BR-38)", async () => {
    const before = await prisma.ticket.count();
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("simulated disk failure"));

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "photo.png");

    writeFileSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("cleans up a file that was already written to disk when a LATER attachment in the same request fails (BR-38 compensation, not just the DB rollback)", async () => {
    // A single-attachment failure (above) never actually writes a file, so
    // it can't prove the compensation logic — only that Postgres rolled
    // back, which it would do anyway. This uses two files so the first
    // write genuinely lands on disk before the second one fails, and checks
    // that file is gone afterward, not just that the ticket row is.
    const before = await prisma.ticket.count();
    const capturedPaths: string[] = [];
    let call = 0;
    const originalWriteFile = fs.writeFile;
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (filePath, data, options) => {
      call += 1;
      capturedPaths.push(String(filePath));
      if (call === 2) {
        throw new Error("simulated disk failure on the second file");
      }
      return originalWriteFile(filePath as string, data as Buffer, options as never);
    });

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "first.png")
      .attach("attachments", PDF_BASE, "second.pdf");

    writeFileSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(await prisma.ticket.count()).toBe(before);
    expect(capturedPaths).toHaveLength(2);

    // The first file's write genuinely succeeded — prove it was cleaned up
    // rather than left orphaned on disk.
    await expect(fs.access(capturedPaths[0])).rejects.toThrow();
  });

  it("one invalid file among several rejects the whole request before creating anything (BR-38 — validate before any write)", async () => {
    const before = await prisma.ticket.count();
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field(validBody())
      .attach("attachments", PNG_BASE, "good.png")
      .attach("attachments", Buffer.from("not a real file"), "bad.png");
    expect(res.status).toBe(415);
    expect(await prisma.ticket.count()).toBe(before);
  });
});
