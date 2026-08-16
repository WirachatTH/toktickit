import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
void request; void app;

// Issue 4 — write this test yourself, using health.test.ts as the pattern.
// Requires the DB to be migrated and seeded first.
// It should assert: GET /api/categories returns 200 and the four seeded
// category names in id order.
describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, name: "Account and Access" }),
        expect.objectContaining({ id: 2, name: "Hardware" }),
        expect.objectContaining({ id: 3, name: "Software" }),
        expect.objectContaining({ id: 4, name: "Network" })
      ])
    );
    // ensure order by checking ids
    const ids = res.body.map((c: any) => c.id);
    expect(ids).toEqual([1, 2, 3, 4]);
  });
});
