import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { seed } from "../../prisma/seed.js";

// Issue 4 — Development Requester Selector reference-data endpoints
// (docs/lab-02/api-spec.md §2-3, specification.md BR-06, AC-14).

const prisma = getPrisma();

beforeAll(async () => {
  await seed(prisma);
});

describe("GET /api/requesters", () => {
  it("returns only active requesters, without an isActive field", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    for (const requester of res.body) {
      expect(requester).toMatchObject({ id: expect.any(Number), name: expect.any(String), email: expect.any(String) });
      expect(requester).not.toHaveProperty("isActive");
    }
  });

  it("never includes the seeded inactive requester", async () => {
    const res = await request(app).get("/api/requesters");
    const emails = res.body.map((r: { email: string }) => r.email);
    expect(emails).not.toContain("ananya.ruangrit@kmutt.ac.th");
  });

  it("orders results by name ascending", async () => {
    const res = await request(app).get("/api/requesters");
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("requires no X-Dev-Requester-Id header — nothing resembling authentication gates this endpoint", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/systems", () => {
  it("returns only active Related Systems, ordered by id ascending", async () => {
    const res = await request(app).get("/api/systems");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);

    const ids = res.body.map((s: { id: number }) => s.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));

    for (const system of res.body) {
      expect(system).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
      expect(system).not.toHaveProperty("isActive");
    }
  });

  // The seed only ever creates active Related Systems, so without this
  // fixture nothing in the suite could ever observe the isActive filter
  // doing anything — the test above would pass identically whether or not
  // `where: { isActive: true }` were even present (confirmed by deleting
  // it and re-running: 15/15 still green). This creates and cleans up its
  // own inactive row so the filter has something real to be tested against.
  describe("with a genuinely inactive Related System present", () => {
    let inactiveId: number;

    beforeAll(async () => {
      const inactive = await prisma.relatedSystem.create({
        data: { name: `Decommissioned Test System ${Date.now()}`, isActive: false },
      });
      inactiveId = inactive.id;
    });

    afterAll(async () => {
      await prisma.relatedSystem.delete({ where: { id: inactiveId } });
    });

    it("never includes it", async () => {
      const res = await request(app).get("/api/systems");
      const ids = res.body.map((s: { id: number }) => s.id);
      expect(ids).not.toContain(inactiveId);
    });
  });
});
