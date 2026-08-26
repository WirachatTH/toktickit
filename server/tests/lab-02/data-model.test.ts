import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";
void app;

// Issue 2 — Data Model & Seed (docs/lab-02/specification.md §5, §7).
// Requires the DB to already be migrated (see README "Applying the Lab 2
// database migration and seed"). These tests run against the real dev
// database, matching the convention set by tests/lab-01/categories.test.ts.

const prisma = getPrisma();

describe("Lab 2 seed data", () => {
  it("is idempotent: running the seed twice produces identical row counts", async () => {
    const countsBefore = {
      category: await prisma.category.count(),
      relatedSystem: await prisma.relatedSystem.count(),
      requesterUser: await prisma.requesterUser.count(),
    };

    await seed(prisma);

    const countsAfter = {
      category: await prisma.category.count(),
      relatedSystem: await prisma.relatedSystem.count(),
      requesterUser: await prisma.requesterUser.count(),
    };

    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps the 4 Lab 1 categories untouched", async () => {
    const count = await prisma.category.count();
    expect(count).toBe(4);
  });

  it("seeds at least 6 active Related Systems", async () => {
    const activeCount = await prisma.relatedSystem.count({ where: { isActive: true } });
    expect(activeCount).toBeGreaterThanOrEqual(6);
  });

  it("seeds at least 4 active and at least 1 inactive Development Requester", async () => {
    const activeCount = await prisma.requesterUser.count({ where: { isActive: true } });
    const inactiveCount = await prisma.requesterUser.count({ where: { isActive: false } });
    expect(activeCount).toBeGreaterThanOrEqual(4);
    expect(inactiveCount).toBeGreaterThanOrEqual(1);
  });

  it("the seeded inactive requester is queryable directly (data exists even though the Selector will exclude it)", async () => {
    const inactive = await prisma.requesterUser.findUnique({
      where: { email: "ananya.ruangrit@kmutt.ac.th" },
    });
    expect(inactive).not.toBeNull();
    expect(inactive?.isActive).toBe(false);
  });
});

describe("Ticket schema constraints", () => {
  let requesterId: number;
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    await seed(prisma);
    const requester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
    const category = await prisma.category.findFirstOrThrow();
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    requesterId = requester.id;
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  it("rejects two Tickets with the same ticketNumber (unique constraint)", async () => {
    const ticketNumber = `TCK-TEST${Date.now()}`;
    const base = {
      requesterId,
      categoryId,
      relatedSystemId,
      ticketNumber,
      summary: "Constraint test ticket",
      description: "Used to verify the ticketNumber unique constraint at the DB level.",
    };

    await prisma.ticket.create({ data: base });

    await expect(prisma.ticket.create({ data: base })).rejects.toThrow();
  });

  it("rejects a Ticket referencing a nonexistent Requester/Category/RelatedSystem (foreign key constraint)", async () => {
    const bogus = {
      requesterId: -1,
      categoryId,
      relatedSystemId,
      ticketNumber: `TCK-FKTEST${Date.now()}`,
      summary: "FK constraint test",
      description: "Used to verify the requesterId foreign key constraint.",
    };

    await expect(prisma.ticket.create({ data: bogus })).rejects.toThrow();
  });

  it("blocks deleting a Category that a Ticket still references (onDelete: Restrict)", async () => {
    const category = await prisma.category.create({ data: { name: `Temp Category ${Date.now()}` } });
    await prisma.ticket.create({
      data: {
        requesterId,
        categoryId: category.id,
        relatedSystemId,
        ticketNumber: `TCK-RESTRICT${Date.now()}`,
        summary: "Restrict-delete test ticket",
        description: "Used to verify Category cannot be deleted while referenced.",
      },
    });

    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
  });
});
