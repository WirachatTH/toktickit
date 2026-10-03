import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { ThrowawaySchema } from "./helpers/throwawaySchema.js";
import { sessionCookieFor } from "./helpers/sessions.js";

// API-70, API-82 — the last active Administrator and the BR-81 lock order
// (docs/lab-03/specification.md BR-57, BR-58, BR-81; D-22).
//
// These need a database with exactly two (API-70) or four (API-82) active
// Administrators, which the shared development database cannot give without
// touching the seeded accounts. So this file builds a throwaway schema, points
// DATABASE_URL at it, and only then imports the app: the app's Prisma client is
// a singleton created from DATABASE_URL on first use, and Vitest gives every
// test file its own module graph.

const schema = new ThrowawaySchema();
const originalUrl = process.env.DATABASE_URL;
let app: Express;
let prisma: PrismaClient;
let n = 0;

beforeAll(async () => {
  await schema.create();
  schema.applyMigrations();
  process.env.DATABASE_URL = schema.url;
  app = (await import("../../src/app.js")).app;
  prisma = (await import("../../src/prisma.js")).getPrisma();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await schema.drop();
  process.env.DATABASE_URL = originalUrl;
});

// Exactly `count` active Administrators, each signed in: every earlier user is
// deactivated first, so the count the server sees is exactly this.
async function onlyAdministrators(count: number) {
  await prisma.session.deleteMany({});
  await prisma.user.updateMany({ data: { isActive: false } });
  const admins: { id: number; cookie: string }[] = [];
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: { name: `Admin ${++n}`, email: `admin${n}@lastadmin.test`, role: "ADMINISTRATOR", mustChangePassword: false },
    });
    admins.push({ id: user.id, cookie: await sessionCookieFor(prisma, user.id) });
  }
  return admins;
}
const patch = (by: { cookie: string }, id: number, body: object) =>
  request(app).patch(`/api/admin/users/${id}`).set("Cookie", by.cookie).send(body);
const activeAdmins = () => prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });

describe("the last active Administrator (BR-58, AC-40)", () => {
  it("API-70 two Administrators deactivating or demoting each other at once leave exactly one active Administrator", async () => {
    let refusedAsLast = 0;
    for (const change of [{ isActive: false }, { role: "IT_STAFF" }]) {
      for (let round = 0; round < 6; round++) {
        const [a, b] = await onlyAdministrators(2);
        const results = await Promise.all([patch(a, b.id, change), patch(b, a.id, change)]);
        const label = `${JSON.stringify(change)} round ${round}: ${results.map((r) => `${r.status} ${r.body?.error?.code ?? ""}`).join(" / ")}`;
        // Never a server error (a deadlock would surface as 500).
        for (const r of results) expect(r.status, label).not.toBe(500);
        expect(results.filter((r) => r.status === 200), label).toHaveLength(1);
        // The loser is refused by the rule (409) — or, when the winner's change
        // already ended the loser's session (BR-59), by having no session (401).
        const loser = results.find((r) => r.status !== 200)!;
        expect([409, 401], label).toContain(loser.status);
        if (loser.status === 409) {
          expect(loser.body.error.code, label).toBe("LAST_ADMINISTRATOR");
          refusedAsLast++;
        }
        expect(await activeAdmins(), label).toBe(1);
      }
    }
    // The rule itself must be what refused at least some of them.
    expect(refusedAsLast).toBeGreaterThan(0);
  });

  it("with one Administrator left, the self rule (BR-57) is what stops them, and changing others still works", async () => {
    const [a] = await onlyAdministrators(1);
    const staff = await prisma.user.create({ data: { name: "Staff", email: `staff${++n}@lastadmin.test`, role: "IT_STAFF", mustChangePassword: false } });
    const self = await patch(a, a.id, { isActive: false });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe("SELF_CHANGE_FORBIDDEN");
    // Making the staff member an Administrator and back is fine while another remains.
    expect((await patch(a, staff.id, { role: "ADMINISTRATOR" })).status).toBe(200);
    expect((await patch(a, staff.id, { role: "IT_STAFF" })).status).toBe(200);
    expect(await activeAdmins()).toBe(1);
  });
});

describe("a lock plan made from a stale read (BR-81)", () => {
  // The handler plans its locks from an unlocked read. Here that read sees an
  // IT Staff member, so only their row is locked — but by the time the lock is
  // granted, another transaction has made them the only active Administrator.
  // The handler must notice and start over with the Administrators locked,
  // not deactivate the last one.
  it("API-70 a lock plan made from a stale read is redone: the target became the last active Administrator while it waited", async () => {
    const [a] = await onlyAdministrators(1);
    const target = await prisma.user.create({ data: { name: "Soon admin", email: `soon${++n}@lastadmin.test`, role: "IT_STAFF", mustChangePassword: false } });
    let pending!: Promise<request.Response>;
    await prisma.$transaction(
      async (tx) => {
        // Hold the target's row, change who the Administrators are, and only
        // then let the request through.
        await tx.user.update({ where: { id: target.id }, data: { role: "ADMINISTRATOR" } });
        await tx.user.update({ where: { id: a.id }, data: { role: "IT_STAFF" } });
        pending = patch(a, target.id, { isActive: false }).then((r) => r);
        // Wait until the request is blocked on the target's row lock.
        for (let i = 0; i < 100; i++) {
          const [{ waiting }] = await prisma.$queryRaw<{ waiting: bigint }[]>`
            SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
          if (waiting > 0n) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("the request never waited for the target's lock");
      },
      { timeout: 15_000 },
    );
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_ADMINISTRATOR");
    expect(await activeAdmins()).toBe(1);
  });
});

describe("the BR-81 lock order (no deadlock)", () => {
  it("API-82 two Administrators deactivating two other Administrators at the same moment both succeed, every time", async () => {
    for (let round = 0; round < 6; round++) {
      const [a, b, c, d] = await onlyAdministrators(4);
      const results = await Promise.all([patch(a, c.id, { isActive: false }), patch(b, d.id, { isActive: false })]);
      expect(results.map((r) => r.status), `round ${round}: ${results.map((r) => r.body?.error?.code ?? "").join(" / ")}`).toEqual([200, 200]);
      expect(await activeAdmins()).toBe(2);
    }
  });
});
