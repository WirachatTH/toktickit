import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE } from "../../src/session.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// API-23 — GET /api/auth/session (docs/lab-04/api-spec.md §5, specification.md
// D-20, FR-19). The app asks who is signed in on every page load. Lab 3's
// GET /api/auth/me answers 401 to a visitor with no session, which the browser
// logs as a console error on every signed-out visit. This route answers the
// same question with 200 and `user: null`, and /me keeps its Lab 3 contract.

const prisma = getPrisma();
const stamp = Date.now();
const ids: number[] = [];

async function makeUser(label: string, data: { mustChangePassword?: boolean; isActive?: boolean } = {}) {
  const user = await prisma.user.create({
    data: { name: `Session4 ${label}`, email: `session4.${label}.${stamp}@kmutt.ac.th`, role: "IT_STAFF", mustChangePassword: false, ...data },
  });
  ids.push(user.id);
  return user;
}

let active: Awaited<ReturnType<typeof makeUser>>;
let mustChange: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  active = await makeUser("active");
  mustChange = await makeUser("mustchange", { mustChangePassword: true });
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("API-23 GET /api/auth/session answers who is signed in, never 401 (D-20)", () => {
  it("answers 200 with user null without a session, with a made-up cookie, and never caches it", async () => {
    for (const res of [
      await request(app).get("/api/auth/session"),
      await request(app).get("/api/auth/session").set("Cookie", `${SESSION_COOKIE}=not-a-real-token`),
    ]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: null });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("returns exactly what /api/auth/me returns for a signed-in user", async () => {
    const cookie = await sessionCookieFor(prisma, active.id);
    const session = await request(app).get("/api/auth/session").set("Cookie", cookie);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(session.status).toBe(200);
    expect(me.status).toBe(200);
    expect(session.body).toEqual(me.body);
    expect(session.body.user).toMatchObject({ id: active.id, role: "IT_STAFF", mustChangePassword: false });
  });

  it("works for a session that must still change its password, as /me does (BR-02)", async () => {
    const cookie = await sessionCookieFor(prisma, mustChange.id);
    const res = await request(app).get("/api/auth/session").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: mustChange.id, mustChangePassword: true });
  });

  it("answers user null for an expired session, and for a deactivated user's session", async () => {
    const expiredCookie = await sessionCookieFor(prisma, active.id);
    await prisma.session.updateMany({ where: { userId: active.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/api/auth/session").set("Cookie", expiredCookie)).body).toEqual({ user: null });

    const user = await makeUser("deactivated");
    const cookie = await sessionCookieFor(prisma, user.id);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await request(app).get("/api/auth/session").set("Cookie", cookie)).body).toEqual({ user: null });
  });

  it("leaves Lab 3's /api/auth/me unchanged: 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
