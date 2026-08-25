import { test, expect, describe } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("GET /api/systems", () => {
  test("should return 200 and a list of related systems", async () => {
    const res = await request(app).get("/api/systems");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("id");
      expect(res.body[0]).toHaveProperty("name");
    }
  });
});
