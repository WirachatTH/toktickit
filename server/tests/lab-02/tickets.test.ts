import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("POST /api/tickets", () => {
  it("creates a ticket with valid data", async () => {
    // Assuming seeded data: category 1, system 1, requester 1 exist
    const res = await request(app)
      .post("/api/tickets")
      .send({
        summary: "Test Summary",
        description: "Test Description",
        categoryId: 1,
        systemId: 1,
        priority: "MEDIUM",
        requesterId: 1
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("ticketNumber");
    expect(res.body.summary).toBe("Test Summary");
    expect(res.body.status).toBe("NEW");
  });

  it("returns 400 if summary is missing", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({
        description: "Test Description",
        categoryId: 1,
        systemId: 1,
        priority: "MEDIUM",
        requesterId: 1
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Summary is required/);
  });

  it("returns 400 if summary exceeds 120 characters", async () => {
    const longSummary = "A".repeat(121);
    const res = await request(app)
      .post("/api/tickets")
      .send({
        summary: longSummary,
        description: "Test Description",
        categoryId: 1,
        systemId: 1,
        priority: "MEDIUM",
        requesterId: 1
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/<= 120 characters/);
  });

  it("returns 400 if description exceeds 1000 characters", async () => {
    const longDesc = "A".repeat(1001);
    const res = await request(app)
      .post("/api/tickets")
      .send({
        summary: "Valid Summary",
        description: longDesc,
        categoryId: 1,
        systemId: 1,
        priority: "MEDIUM",
        requesterId: 1
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/<= 1000 characters/);
  });

  it("returns 400 if requester is missing", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({
        summary: "Valid Summary",
        description: "Test Description",
        categoryId: 1,
        systemId: 1,
        priority: "MEDIUM"
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });
});

describe("POST /api/tickets/:id/attachments", () => {
  it("returns 400 if file is missing", async () => {
    const res = await request(app)
      .post("/api/tickets/1/attachments") // Assuming ticket 1 exists from previous test
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file uploaded/);
  });
});
