import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
import { storedFilePath } from "../../src/attachmentStorage.js";

const PNG_BASE = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000020001e221bc330000000049454e44ae426082",
  "hex"
);

// Issue 7 — My Tickets list endpoint (docs/lab-02/specification.md BR-12,
// BR-14-19, Decision D-5; api-spec.md §5). Each describe block below uses
// its own dedicated Requester so the fixtures for one concern (sort,
// pagination, ownership...) can never leak into another's counts.

const prisma = getPrisma();

let categoryA: { id: number; name: string };
let categoryB: { id: number; name: string };
let systemA: { id: number; name: string };
let systemB: { id: number; name: string };

let ownerAId: number;
let ownerBId: number;
let sortFixtureRequesterId: number;
let paginationRequesterId: number;
// Created directly (not drawn from the seed pool) so "zero tickets ever"
// and the LIKE-escaping/attachmentCount/deactivated-system edge cases each
// get a guaranteed-clean slate, independent of the other describe blocks.
let freshRequesterId: number;
let edgeCaseRequesterId: number;
let inactiveRequesterId: number;

function authHeader(requesterId: number) {
  return { "X-Dev-Requester-Id": String(requesterId) };
}

// requestedPriority is a Postgres native enum — Postgres sorts native enums
// by their declaration order (LOW, MEDIUM, HIGH in schema.prisma), not
// alphabetically. Used to check monotonicity without hand-deriving the
// tie-broken exact order.
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

beforeAll(async () => {
  await seed(prisma);

  const requesters = await prisma.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 4 });
  [ownerAId, ownerBId, sortFixtureRequesterId, paginationRequesterId] = requesters.map((r) => r.id);

  const inactive = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: false } });
  inactiveRequesterId = inactive.id;

  const freshRequester = await prisma.requesterUser.create({
    data: { name: "Edge Case Fresh Requester", email: `edge-fresh-${Date.now()}@kmutt.ac.th`, isActive: true },
  });
  freshRequesterId = freshRequester.id;
  const edgeCaseRequester = await prisma.requesterUser.create({
    data: { name: "Edge Case Requester", email: `edge-case-${Date.now()}@kmutt.ac.th`, isActive: true },
  });
  edgeCaseRequesterId = edgeCaseRequester.id;

  const categories = await prisma.category.findMany({ orderBy: { id: "asc" }, take: 2 });
  [categoryA, categoryB] = categories;
  const systems = await prisma.relatedSystem.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 2 });
  [systemA, systemB] = systems;

  // --- Ownership-scoping fixtures (API-10, API-11) ---
  await prisma.ticket.create({
    data: {
      requesterId: ownerAId,
      categoryId: categoryA.id,
      relatedSystemId: systemA.id,
      ticketNumber: "TCK-OWNER-A001",
      summary: "Requester A's own ticket",
      description: "Only Requester A should ever see this ticket in their list.",
    },
  });
  await prisma.ticket.create({
    data: {
      requesterId: ownerBId,
      categoryId: categoryA.id,
      relatedSystemId: systemA.id,
      ticketNumber: "TCK-OWNER-B001",
      summary: "Requester B's own ticket",
      description: "Only Requester B should ever see this ticket in their list.",
    },
  });

  // --- Search/filter/sort fixtures — six tickets, every field deliberately
  // distinct and criss-crossed so a test on one field can't accidentally
  // pass because it happens to agree with another field's order. ---
  const base = new Date("2020-01-01T00:00:00.000Z");
  const minutes = (n: number) => new Date(base.getTime() + n * 60_000);

  const sortFixtures = [
    { n: "001", summary: "Laptop battery drains quickly", category: categoryA, system: systemA, priority: "LOW", created: 0 },
    { n: "002", summary: "Wifi keeps dropping during class", category: categoryB, system: systemB, priority: "HIGH", created: 1 },
    { n: "003", summary: "Printer paper jam every time", category: categoryA, system: systemB, priority: "MEDIUM", created: 2 },
    { n: "004", summary: "VPN login fails intermittently", category: categoryB, system: systemA, priority: "LOW", created: 3 },
    { n: "005", summary: "Grade submission app crashes on save", category: categoryA, system: systemA, priority: "HIGH", created: 4 },
    { n: "006", summary: "Email attachments not downloading", category: categoryB, system: systemB, priority: "MEDIUM", created: 5 },
  ] as const;

  for (const f of sortFixtures) {
    await prisma.ticket.create({
      data: {
        requesterId: sortFixtureRequesterId,
        categoryId: f.category.id,
        relatedSystemId: f.system.id,
        ticketNumber: `TCK-FIX-${f.n}`,
        summary: f.summary,
        description: `Fixture ticket ${f.n} for Issue 7 search/filter/sort tests.`,
        requestedPriority: f.priority,
        // updatedAt deliberately runs opposite to createdAt so a test that
        // sorts by the wrong field (e.g. always by createdAt) is caught.
        createdAt: minutes(f.created),
        updatedAt: minutes(5 - f.created),
      },
    });
  }

  // --- Pagination fixtures — 23 tickets, one page short of 3 full pages at
  // the documented default pageSize of 10 (10 + 10 + 3). ---
  await prisma.ticket.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      requesterId: paginationRequesterId,
      categoryId: categoryA.id,
      relatedSystemId: systemA.id,
      ticketNumber: `TCK-PAGE-${String(i).padStart(3, "0")}`,
      summary: `Pagination fixture ticket ${i}`,
      description: "Fixture ticket for Issue 7 pagination tests.",
      createdAt: minutes(i),
    })),
  });
});

afterAll(async () => {
  // Clean up any attachment files written to disk by this file's tests
  const edgeTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { ticketNumber: { startsWith: "TCK-OWNER-" } },
        { ticketNumber: { startsWith: "TCK-FIX-" } },
        { ticketNumber: { startsWith: "TCK-PAGE-" } },
        { ticketNumber: { startsWith: "TCK-EDGE-" } },
      ],
    },
    select: { id: true },
  });
  if (edgeTickets.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { ticketId: { in: edgeTickets.map((t) => t.id) } },
      select: { storedFilename: true },
    });
    await Promise.all(attachments.map((a) => fs.unlink(storedFilePath(a.storedFilename)).catch(() => {})));
  }

  // Scoped by ticketNumber prefix, not by requesterId — these Requesters
  // come from the same small shared seed pool other test files also draw
  // from, and deleting by requesterId here could reach a row that belongs
  // to one of them. Every fixture this file creates uses one of these three
  // prefixes and nothing else in the app does, so this can only ever delete
  // this file's own rows.
  await prisma.ticket.deleteMany({
    where: {
      OR: [
        { ticketNumber: { startsWith: "TCK-OWNER-" } },
        { ticketNumber: { startsWith: "TCK-FIX-" } },
        { ticketNumber: { startsWith: "TCK-PAGE-" } },
        { ticketNumber: { startsWith: "TCK-EDGE-" } },
      ],
    },
  });
  // Ticket.requester is onDelete: Restrict — these two self-created
  // Requesters can only be deleted once every Ticket referencing them
  // (the deleteMany above) is already gone.
  await prisma.requesterUser.deleteMany({ where: { id: { in: [freshRequesterId, edgeCaseRequesterId] } } });
});

describe("GET /api/tickets — ownership scoping", () => {
  it("returns only the caller's own tickets — Requester B's never appear in Requester A's response (BR-12)", async () => {
    const res = await request(app).get("/api/tickets").set(authHeader(ownerAId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toContain("TCK-OWNER-A001");
    expect(numbers).not.toContain("TCK-OWNER-B001");
  });

  it("ignores an attempt to widen scope via query manipulation — always scoped to the header identity", async () => {
    // No requesterId query parameter is part of the documented contract;
    // this proves a client can't smuggle one in to read someone else's list.
    const res = await request(app)
      .get(`/api/tickets?requesterId=${ownerBId}`)
      .set(authHeader(ownerAId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toContain("TCK-OWNER-A001");
    expect(numbers).not.toContain("TCK-OWNER-B001");
  });

  it("rejects with no X-Dev-Requester-Id header", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/tickets — search (BR-14)", () => {
  it("matches a Ticket Number prefix, case-insensitively", async () => {
    const res = await request(app)
      .get("/api/tickets?search=tck-fix-002")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-002"]);
  });

  it("matches a Summary substring, case-insensitively", async () => {
    const res = await request(app).get("/api/tickets?search=DROP").set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-002"]);
  });

  it("treats a whitespace-only search as no search at all", async () => {
    const res = await request(app).get("/api/tickets?search=%20%20%20").set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(6);
  });

  it("treats SQL-meaningful characters as a literal search term — parameterized, not concatenated (API-17)", async () => {
    const res = await request(app)
      .get(`/api/tickets?search=${encodeURIComponent("' OR '1'='1")}`)
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    // A vulnerable implementation that concatenated this into the WHERE
    // clause would return all 6 fixtures; a safe one returns zero, since no
    // fixture actually contains that literal string.
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/tickets — filters (BR-15)", () => {
  it("narrows by categoryId", async () => {
    const res = await request(app)
      .get(`/api/tickets?categoryId=${categoryA.id}`)
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber).sort();
    expect(numbers).toEqual(["TCK-FIX-001", "TCK-FIX-003", "TCK-FIX-005"]);
  });

  it("narrows by relatedSystemId", async () => {
    const res = await request(app)
      .get(`/api/tickets?relatedSystemId=${systemB.id}`)
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber).sort();
    expect(numbers).toEqual(["TCK-FIX-002", "TCK-FIX-003", "TCK-FIX-006"]);
  });

  it("narrows by requestedPriority", async () => {
    const res = await request(app)
      .get("/api/tickets?requestedPriority=HIGH")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber).sort();
    expect(numbers).toEqual(["TCK-FIX-002", "TCK-FIX-005"]);
  });

  it("composes a filter with search", async () => {
    const res = await request(app)
      .get(`/api/tickets?search=grade&categoryId=${categoryA.id}`)
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-005"]);
  });

  it("composes two filters together", async () => {
    const res = await request(app)
      .get(`/api/tickets?categoryId=${categoryA.id}&requestedPriority=HIGH`)
      .set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-005"]);
  });
});

describe("GET /api/tickets — sort (BR-16, BR-17)", () => {
  it("defaults to createdAt descending with no sort specified", async () => {
    const res = await request(app).get("/api/tickets?pageSize=6").set(authHeader(sortFixtureRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      "TCK-FIX-006",
      "TCK-FIX-005",
      "TCK-FIX-004",
      "TCK-FIX-003",
      "TCK-FIX-002",
      "TCK-FIX-001",
    ]);
  });

  it("sorts by createdAt ascending", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=createdAt&order=asc&pageSize=6")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      "TCK-FIX-001",
      "TCK-FIX-002",
      "TCK-FIX-003",
      "TCK-FIX-004",
      "TCK-FIX-005",
      "TCK-FIX-006",
    ]);
  });

  it("sorts by updatedAt ascending — the opposite order of createdAt, proving it isn't just sorting by createdAt again", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=updatedAt&order=asc&pageSize=6")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      "TCK-FIX-006",
      "TCK-FIX-005",
      "TCK-FIX-004",
      "TCK-FIX-003",
      "TCK-FIX-002",
      "TCK-FIX-001",
    ]);
  });

  it("sorts by ticketNumber descending", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=ticketNumber&order=desc&pageSize=6")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      "TCK-FIX-006",
      "TCK-FIX-005",
      "TCK-FIX-004",
      "TCK-FIX-003",
      "TCK-FIX-002",
      "TCK-FIX-001",
    ]);
  });

  it("sorts by summary ascending (alphabetical)", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=summary&order=asc&pageSize=6")
      .set(authHeader(sortFixtureRequesterId));
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      "TCK-FIX-006", // Email...
      "TCK-FIX-005", // Grade...
      "TCK-FIX-001", // Laptop...
      "TCK-FIX-003", // Printer...
      "TCK-FIX-004", // VPN...
      "TCK-FIX-002", // Wifi...
    ]);
  });

  it("sorts by requestedPriority in ascending rank order (LOW, MEDIUM, HIGH)", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=requestedPriority&order=asc&pageSize=6")
      .set(authHeader(sortFixtureRequesterId));
    const ranks = res.body.data.map((t: { requestedPriority: string }) => PRIORITY_RANK[t.requestedPriority]);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });
});

describe("GET /api/tickets — pagination (BR-18)", () => {
  it("returns a full first page with correct metadata", async () => {
    const res = await request(app).get("/api/tickets").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 10, totalItems: 23, totalPages: 3 });
  });

  it("returns a full middle page (page 2)", async () => {
    const res = await request(app).get("/api/tickets?page=2").set(authHeader(paginationRequesterId));
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination.page).toBe(2);
  });

  it("returns the final partial page (page 3, 3 items)", async () => {
    const res = await request(app).get("/api/tickets?page=3").set(authHeader(paginationRequesterId));
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toEqual({ page: 3, pageSize: 10, totalItems: 23, totalPages: 3 });
  });

  it("slices cleanly across all three pages — every ticket appears exactly once", async () => {
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        request(app).get(`/api/tickets?page=${page}`).set(authHeader(paginationRequesterId))
      )
    );
    const allNumbers = pages.flatMap((res) => res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber));
    expect(new Set(allNumbers).size).toBe(23);
  });

  it("returns an empty page with unchanged metadata for a page number beyond range", async () => {
    const res = await request(app).get("/api/tickets?page=999").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 999, pageSize: 10, totalItems: 23, totalPages: 3 });
  });
});

describe("GET /api/tickets — invalid query parameters are clamped, never rejected (BR-19)", () => {
  it("clamps a negative page to 1", async () => {
    const res = await request(app).get("/api/tickets?page=-1").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.data).toHaveLength(10);
  });

  it("clamps a non-numeric page to 1", async () => {
    const res = await request(app).get("/api/tickets?page=abc").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  it("falls back to the default sort for an unknown sort field, without erroring", async () => {
    const res = await request(app).get("/api/tickets?sort=notAField").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
  });

  it("clamps an oversized pageSize to the documented maximum of 50 (API-18)", async () => {
    const res = await request(app).get("/api/tickets?pageSize=999").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(50);
    expect(res.body.data).toHaveLength(23);
  });

  it("clamps pageSize=0 up to 1 rather than treating it as unbounded or erroring", async () => {
    const res = await request(app).get("/api/tickets?pageSize=0").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });

  it("does not crash on an astronomically large page number (found by probing the running server manually)", async () => {
    // Number.isInteger(1e26) is true — it's an ordinary finite integer, just
    // one far outside any range Postgres/Prisma can bind as a query param.
    // Before this was fixed, (page - 1) * pageSize overflowed and Prisma
    // threw, producing a raw 500 for what looks like a syntactically valid
    // page value — exactly the kind of "mistyped bookmarked URL" D-5 says
    // must still return something useful, not an error.
    const res = await request(app)
      .get("/api/tickets?page=99999999999999999999999999")
      .set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  it("clamps a very large but numerically safe page down to a bounded maximum instead of computing an unsafe offset", async () => {
    const res = await request(app).get("/api/tickets?page=5000000").set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(23);
  });

  it("ignores a duplicated query parameter (?categoryId=1&categoryId=2 parses as an array) instead of crashing", async () => {
    const res = await request(app)
      .get(`/api/tickets?categoryId=${categoryA.id}&categoryId=${categoryB.id}`)
      .set(authHeader(paginationRequesterId));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/tickets — rare real-world scenarios", () => {
  it("returns a genuinely empty page (not a 500, not a clamp to page 1 of nothing) for a Requester who has never created a ticket", async () => {
    const res = await request(app).get("/api/tickets").set(authHeader(freshRequesterId));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
  });

  it("treats a literal % or _ in the search term as a literal character, not a SQL LIKE wildcard (BR-14)", async () => {
    // Found by probing: searching the literal string "50%" against a
    // ticket containing "50%" ALSO matched an unrelated ticket that only
    // starts with "50", because Prisma's contains/startsWith parameterizes
    // against SQL injection but does not escape LIKE's own metacharacters
    // (% matches any run of characters, _ matches any one character) —
    // those are interpreted by the LIKE operator itself, not by SQL
    // parsing, so parameterization alone doesn't neutralize them.
    const withPercent = await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-PCT1",
        summary: "Battery at 50% capacity issue",
        description: "Edge-case fixture for LIKE wildcard escaping.",
      },
    });
    await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-PCT2",
        summary: "50 items delivered late today",
        description: "Edge-case fixture for LIKE wildcard escaping — must NOT match a search for '50%'.",
      },
    });

    const percentRes = await request(app)
      .get(`/api/tickets?search=${encodeURIComponent("50%")}`)
      .set(authHeader(edgeCaseRequesterId));
    expect(percentRes.status).toBe(200);
    expect(percentRes.body.data.map((t: { id: number }) => t.id)).toEqual([withPercent.id]);

    // Sanity check the other direction: an unqualified "50" still matches both.
    const plainRes = await request(app).get("/api/tickets?search=50").set(authHeader(edgeCaseRequesterId));
    expect(plainRes.body.data).toHaveLength(2);

    const underscoreTicket = await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-USC1",
        summary: "Config key report_2026 is missing",
        description: "Edge-case fixture: literal underscore must not act as a single-character wildcard.",
      },
    });
    await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-USC2",
        summary: "Config key reportX2026 is missing",
        description: "Edge-case fixture — must NOT match a search for 'report_2026'.",
      },
    });
    const underscoreRes = await request(app)
      .get(`/api/tickets?search=${encodeURIComponent("report_2026")}`)
      .set(authHeader(edgeCaseRequesterId));
    expect(underscoreRes.body.data.map((t: { id: number }) => t.id)).toEqual([underscoreTicket.id]);
  });

  it("attachmentCount reflects only active attachments — drops after a soft-remove, through the real upload/remove routes (cross-issue with Issue 6)", async () => {
    const ticket = await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-ATT1",
        summary: "Ticket for attachmentCount cross-issue integration check",
        description: "Verifies GET /api/tickets' attachmentCount excludes soft-removed attachments.",
      },
    });

    const uploads = await Promise.all(
      ["a.png", "b.png", "c.png"].map((name) =>
        request(app)
          .post(`/api/tickets/${ticket.id}/attachments`)
          .set(authHeader(edgeCaseRequesterId))
          .attach("file", PNG_BASE, name)
      )
    );
    expect(uploads.every((r) => r.status === 201)).toBe(true);

    const beforeRemoval = await request(app).get("/api/tickets?search=attachmentCount").set(authHeader(edgeCaseRequesterId));
    const beforeEntry = beforeRemoval.body.data.find((t: { id: number }) => t.id === ticket.id);
    expect(beforeEntry.attachmentCount).toBe(3);

    await request(app)
      .patch(`/api/tickets/${ticket.id}/attachments/${uploads[0].body.id}/remove`)
      .set(authHeader(edgeCaseRequesterId))
      .send({ reason: "Wrong file, superseded by the other two." });

    const afterRemoval = await request(app).get("/api/tickets?search=attachmentCount").set(authHeader(edgeCaseRequesterId));
    const afterEntry = afterRemoval.body.data.find((t: { id: number }) => t.id === ticket.id);
    expect(afterEntry.attachmentCount).toBe(2);
  });

  it("still shows the correct relatedSystemName and stays filterable after that System is deactivated for new tickets", async () => {
    const ticket = await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemB.id,
        ticketNumber: "TCK-EDGE-SYS1",
        summary: "Filed against a System that will later be decommissioned",
        description: "A Requester's historical ticket must keep displaying correctly even after IT deactivates that System.",
      },
    });

    await prisma.relatedSystem.update({ where: { id: systemB.id }, data: { isActive: false } });
    try {
      const res = await request(app)
        .get(`/api/tickets?relatedSystemId=${systemB.id}`)
        .set(authHeader(edgeCaseRequesterId));
      expect(res.status).toBe(200);
      const entry = res.body.data.find((t: { id: number }) => t.id === ticket.id);
      expect(entry).toBeDefined();
      expect(entry.relatedSystemName).toBe(systemB.name);
    } finally {
      // Restore immediately — this row is drawn from the shared seed pool
      // other test files also rely on being active (fileParallelism is off,
      // but files still run one after another against the same database).
      await prisma.relatedSystem.update({ where: { id: systemB.id }, data: { isActive: true } });
    }
  });

  it("matches a Unicode (Thai) substring in the summary, case rules aside", async () => {
    const ticket = await prisma.ticket.create({
      data: {
        requesterId: edgeCaseRequesterId,
        categoryId: categoryA.id,
        relatedSystemId: systemA.id,
        ticketNumber: "TCK-EDGE-THAI",
        summary: "เครื่องพิมพ์ขัดข้องที่ห้อง 204",
        description: "Edge-case fixture confirming ILIKE-based search works correctly on non-ASCII (Thai) text.",
      },
    });

    const res = await request(app)
      .get(`/api/tickets?search=${encodeURIComponent("ขัดข้อง")}`)
      .set(authHeader(edgeCaseRequesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: number }) => t.id)).toContain(ticket.id);
  });
});

describe("GET /api/tickets — unlisted edge cases and robustness checks", () => {
  describe("Authentication and header edge cases", () => {
    it("rejects an inactive requester with 401 UNAUTHENTICATED (BR-10)", async () => {
      const res = await request(app).get("/api/tickets").set(authHeader(inactiveRequesterId));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects a non-numeric X-Dev-Requester-Id header with 401 UNAUTHENTICATED", async () => {
      const res = await request(app).get("/api/tickets").set({ "X-Dev-Requester-Id": "invalid-requester" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects an out-of-Int32 X-Dev-Requester-Id header with 401 UNAUTHENTICATED", async () => {
      const res = await request(app).get("/api/tickets").set({ "X-Dev-Requester-Id": "9999999999" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects a non-existent requester ID with 401 UNAUTHENTICATED", async () => {
      const res = await request(app).get("/api/tickets").set(authHeader(888888));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });
  });

  describe("Search edge cases", () => {
    it("matches multiple words in summary substring", async () => {
      const res = await request(app)
        .get("/api/tickets?search=battery%20drains")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-001"]);
    });

    it("trims leading and trailing whitespace from search query before matching", async () => {
      const res = await request(app)
        .get("/api/tickets?search=%20%20TCK-FIX-003%20%20")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-003"]);
    });

    it("safely handles regex and special characters in search without syntax error", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=${encodeURIComponent(".*+?^${}()|[]\\")}`)
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("Filter edge cases", () => {
    it("returns empty data and totalItems: 0 for a non-existent categoryId without error", async () => {
      const res = await request(app)
        .get("/api/tickets?categoryId=999999")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.totalItems).toBe(0);
      expect(res.body.pagination.totalPages).toBe(0);
    });

    it("ignores a negative categoryId without error", async () => {
      const res = await request(app)
        .get("/api/tickets?categoryId=-5")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.totalItems).toBe(6);
    });

    it("ignores an invalid/unknown requestedPriority value without error", async () => {
      const res = await request(app)
        .get("/api/tickets?requestedPriority=CRITICAL")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.totalItems).toBe(6);
    });

    it("composes search with all three filters (Category, System, and Priority)", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=battery&categoryId=${categoryA.id}&relatedSystemId=${systemA.id}&requestedPriority=LOW`)
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(["TCK-FIX-001"]);
    });

    // A peer reviewer found these within minutes of probing: unlike
    // categoryId=999999 (in-range, just nonexistent — 200 above),
    // categoryId=9999999999 is outside Int32 range and reached Prisma raw,
    // which throws converting it. parsePositiveId only checked
    // Number.isInteger && n > 0 — the same gap parsePage and
    // authenticateRequester's id parsing had already been hardened against
    // elsewhere in this file, just never carried over here.
    it("ignores (rather than 500s on) a categoryId far outside Int32 range", async () => {
      // An INVALID id is ignored outright — the filter doesn't apply at
      // all, same as the negative-categoryId case above — so this returns
      // all 6 fixtures, not zero. That's different from a VALID but
      // nonexistent id (categoryId=999999 above), which applies as a real
      // filter and correctly matches nothing.
      const res = await request(app)
        .get("/api/tickets?categoryId=9999999999")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.totalItems).toBe(6);
    });

    it("ignores (rather than 500s on) a relatedSystemId far outside Int32 range", async () => {
      const res = await request(app)
        .get("/api/tickets?relatedSystemId=9999999999")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.totalItems).toBe(6);
    });

    it("ignores (rather than 500s on) a categoryId exactly one past the Int32 maximum", async () => {
      const res = await request(app)
        .get("/api/tickets?categoryId=2147483648")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.totalItems).toBe(6);
    });

    it("still applies a categoryId at exactly the Int32 maximum as a normal (nonexistent) filter", async () => {
      const res = await request(app)
        .get("/api/tickets?categoryId=2147483647")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("Sort edge cases", () => {
    it("sorts by summary descending (reverse alphabetical)", async () => {
      const res = await request(app)
        .get("/api/tickets?sort=summary&order=desc&pageSize=6")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
        "TCK-FIX-002", // Wifi...
        "TCK-FIX-004", // VPN...
        "TCK-FIX-003", // Printer...
        "TCK-FIX-001", // Laptop...
        "TCK-FIX-005", // Grade...
        "TCK-FIX-006", // Email...
      ]);
    });

    it("sorts by requestedPriority descending in rank order (HIGH, MEDIUM, LOW)", async () => {
      const res = await request(app)
        .get("/api/tickets?sort=requestedPriority&order=desc&pageSize=6")
        .set(authHeader(sortFixtureRequesterId));
      const ranks = res.body.data.map((t: { requestedPriority: string }) => PRIORITY_RANK[t.requestedPriority]);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
      }
    });

    it("falls back to default order=desc when order is invalid", async () => {
      const res = await request(app)
        .get("/api/tickets?sort=createdAt&order=sideways&pageSize=6")
        .set(authHeader(sortFixtureRequesterId));
      expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
        "TCK-FIX-006",
        "TCK-FIX-005",
        "TCK-FIX-004",
        "TCK-FIX-003",
        "TCK-FIX-002",
        "TCK-FIX-001",
      ]);
    });

    // Every other sort test in this file deliberately uses all-distinct
    // field values, which is clean for asserting order but structurally
    // guarantees the id-desc tiebreak code path never runs — a peer
    // reviewer removed the tiebreak entirely and the rest of the suite
    // stayed green. This is the one fixture with a genuine tie: three
    // tickets sharing the identical createdAt, so the primary sort key
    // (default createdAt desc) can't distinguish them at all, and every
    // bit of the resulting order comes from the id-desc tiebreak alone
    // (BR-17).
    it("breaks a tie on the sorted field by id descending, for a genuinely tied createdAt (BR-17)", async () => {
      const tiedCreatedAt = new Date("2021-06-15T12:00:00.000Z");
      const makeTied = (n: string) =>
        prisma.ticket.create({
          data: {
            requesterId: edgeCaseRequesterId,
            categoryId: categoryA.id,
            relatedSystemId: systemA.id,
            ticketNumber: `TCK-EDGE-TIE${n}`,
            summary: `Tiebreak fixture ${n}`,
            description: "Shares an identical createdAt with its siblings to exercise the id-desc tiebreak.",
            createdAt: tiedCreatedAt,
          },
        });
      const tie1 = await makeTied("1");
      const tie2 = await makeTied("2");
      const tie3 = await makeTied("3");

      const res = await request(app)
        .get(`/api/tickets?search=${encodeURIComponent("Tiebreak fixture")}`)
        .set(authHeader(edgeCaseRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([tie3.id, tie2.id, tie1.id]);
    });
  });

  describe("Pagination edge cases", () => {
    it("clamps floating-point page=1.5 to 1", async () => {
      const res = await request(app).get("/api/tickets?page=1.5").set(authHeader(paginationRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it("clamps negative pageSize=-5 to 1", async () => {
      const res = await request(app).get("/api/tickets?pageSize=-5").set(authHeader(paginationRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.pageSize).toBe(1);
      expect(res.body.data).toHaveLength(1);
    });

    it("clamps page=0 to 1", async () => {
      const res = await request(app).get("/api/tickets?page=0").set(authHeader(paginationRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    // Number("") is 0, not NaN — a real JS gotcha. An absent pageSize
    // already defaulted to 10 correctly (Number(undefined) is NaN); a
    // present-but-empty one slipped past that same check and clamped to 1
    // instead, which a peer reviewer caught.
    it("treats an empty pageSize value (?pageSize=) the same as an absent one — defaults to 10", async () => {
      const res = await request(app).get("/api/tickets?pageSize=").set(authHeader(paginationRequesterId));
      expect(res.status).toBe(200);
      expect(res.body.pagination.pageSize).toBe(10);
      expect(res.body.data).toHaveLength(10);
    });
  });
});
