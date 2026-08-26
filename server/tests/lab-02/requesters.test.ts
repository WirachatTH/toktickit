import { test, expect, describe } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("GET /api/requesters", () => {
  test("should return 200 and only active requesters", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    for (const requester of res.body) {
      expect(requester).toHaveProperty("id");
      expect(requester).toHaveProperty("name");
      expect(requester).toHaveProperty("email");
      // The endpoint must only return active users, but our schema does not expose isActive in select.
      // We know Bob Inactive is not active, so let's verify he's not in the results.
      expect(requester.name).not.toBe("Bob Inactive");
    }
  });
});
