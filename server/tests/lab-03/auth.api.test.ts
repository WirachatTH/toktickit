import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request, { type Response } from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword, verifyPassword } from "../../src/password.js";
import { hashSessionToken, SESSION_COOKIE } from "../../src/session.js";
import { resetLoginThrottle } from "../../src/loginThrottle.js";

// API-01 to API-17, API-73, API-80, API-83 — authentication
// (docs/lab-03/api-spec.md §1, specification.md BR-01 to BR-19).
//
// Every account here is created by this file and deleted afterwards (D-22);
// no seeded row is read or changed. The login throttle is reset before each
// test so one test's failures cannot throttle the next.

const prisma = getPrisma();
const stamp = Date.now();
const PASSWORD = "Correct-horse-42";
const WRONG = "Wrong-horse-42";
const createdIds: number[] = [];

type Kind = "active" | "inactive" | "noHash" | "mustChange" | "changer" | "twoSessions" | "expired" | "dummy";
const accounts = {} as Record<Kind, { id: number; email: string }>;

async function makeUser(kind: Kind, data: { isActive?: boolean; mustChangePassword?: boolean; passwordHash?: string | null }) {
  const email = `auth.${kind.toLowerCase()}.${stamp}@kmutt.ac.th`;
  const user = await prisma.user.create({
    data: {
      name: `Auth suite ${kind}`,
      email,
      role: "REQUESTER",
      isActive: data.isActive ?? true,
      mustChangePassword: data.mustChangePassword ?? false,
      passwordHash: data.passwordHash === undefined ? await hashPassword(PASSWORD) : data.passwordHash,
    },
  });
  createdIds.push(user.id);
  accounts[kind] = { id: user.id, email };
}

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });

function cookieOf(res: Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error(`no ${SESSION_COOKIE} cookie in response (${res.status})`);
  return cookie.split(";")[0];
}
const tokenOf = (cookie: string) => cookie.slice(SESSION_COOKIE.length + 1);
const sessionsOf = (id: number) => prisma.session.count({ where: { userId: id } });

beforeAll(async () => {
  await makeUser("active", {});
  await makeUser("inactive", { isActive: false });
  await makeUser("noHash", { passwordHash: null });
  await makeUser("mustChange", { mustChangePassword: true });
  await makeUser("changer", { mustChangePassword: true });
  await makeUser("twoSessions", {});
  await makeUser("expired", {});
  await makeUser("dummy", {});
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  resetLoginThrottle();
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } }); // sessions cascade
});

describe("POST /api/auth/login", () => {
  it("API-01 signs in, sets the session cookie as BR-16 requires, and stores only the token's hash", async () => {
    const res = await login(accounts.active.email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: accounts.active.id, name: "Auth suite active", email: accounts.active.email, role: "REQUESTER", isActive: true, mustChangePassword: false },
    });

    const header = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Strict/);
    expect(header).toMatch(/Path=\/api(;|$)/);
    expect(header).toMatch(/Max-Age=28800/);
    expect(header).not.toMatch(/Secure/); // plain-HTTP development (Secure in production)

    const token = tokenOf(cookieOf(res));
    const row = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    expect(row?.userId).toBe(accounts.active.id);
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0); // the raw token is never stored
  });

  it("API-03 answers an unknown email and a wrong password identically, with no cookie and no session", async () => {
    const before = await sessionsOf(accounts.active.id);
    const unknown = await login(`nobody.${stamp}@kmutt.ac.th`, PASSWORD);
    const wrong = await login(accounts.active.email, WRONG);
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    expect(wrong.body).toEqual(unknown.body);
    expect(unknown.headers["set-cookie"]).toBeUndefined();
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    expect(await sessionsOf(accounts.active.id)).toBe(before);
  });

  it("API-04 answers an account with no password exactly like a wrong password (BR-10)", async () => {
    const res = await login(accounts.noHash.email, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    expect(await sessionsOf(accounts.noHash.id)).toBe(0);
  });

  it("API-05 tells only a caller with the right password that the account is inactive (BR-13)", async () => {
    const right = await login(accounts.inactive.email, PASSWORD);
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe("ACCOUNT_INACTIVE");
    expect(right.headers["set-cookie"]).toBeUndefined();

    const wrong = await login(accounts.inactive.email, WRONG);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(await sessionsOf(accounts.inactive.id)).toBe(0);
  });

  it("API-06 throttles an email after five failures, even with the right password — and an unknown email identically", async () => {
    for (const email of [accounts.active.email, `ghost.${stamp}@kmutt.ac.th`]) {
      for (let i = 0; i < 5; i++) expect((await login(email, WRONG)).status, `failure ${i + 1}`).toBe(401);
      const res = await login(email, PASSWORD);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("TOO_MANY_ATTEMPTS");
      expect(res.body.error.message).toMatch(/^Too many sign-in attempts\. Try again in \d+ minutes?\.$/);
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(14 * 60);
      expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(15 * 60);
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("API-07 does not throttle four failures, a success, then four more — the success cleared the count", async () => {
    for (let i = 0; i < 4; i++) expect((await login(accounts.active.email, WRONG)).status).toBe(401);
    expect((await login(accounts.active.email, PASSWORD)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(accounts.active.email, WRONG)).status).toBe(401);
    expect((await login(accounts.active.email, PASSWORD)).status).toBe(200);
  });

  it("API-08 signs in with the email in mixed case and surrounded by spaces (BR-09)", async () => {
    const res = await login(`  ${accounts.active.email.toUpperCase()}  `, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(accounts.active.email);
  });

  it("API-73 throttles only the email that failed — another account signs in from the same client", async () => {
    for (let i = 0; i < 5; i++) await login(accounts.active.email, WRONG);
    expect((await login(accounts.active.email, PASSWORD)).status).toBe(429);
    expect((await login(accounts.twoSessions.email, PASSWORD)).status).toBe(200);
  });

  it("API-80 deletes the user's expired sessions when they sign in (BR-17)", async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.session.createMany({
      data: [
        { tokenHash: hashSessionToken(`expired-a-${stamp}`), userId: accounts.expired.id, expiresAt: past },
        { tokenHash: hashSessionToken(`expired-b-${stamp}`), userId: accounts.expired.id, expiresAt: past },
      ],
    });
    expect(await sessionsOf(accounts.expired.id)).toBe(2);
    const res = await login(accounts.expired.email, PASSWORD);
    expect(res.status).toBe(200);
    expect(await sessionsOf(accounts.expired.id)).toBe(1); // only the new one
    expect((await request(app).get("/api/auth/me").set("Cookie", cookieOf(res))).status).toBe(200);
  });

  it("API-83 holds the limit under concurrent attempts: a burst gets at most five guesses (BR-14)", async () => {
    const wrongBurst = await Promise.all(Array.from({ length: 20 }, () => login(accounts.dummy.email, WRONG)));
    expect(wrongBurst.filter((r) => r.status === 401)).toHaveLength(5);
    expect(wrongBurst.filter((r) => r.status === 429)).toHaveLength(15);

    resetLoginThrottle();
    const before = await sessionsOf(accounts.dummy.id);
    const attempts = Array.from({ length: 19 }, () => login(accounts.dummy.email, WRONG));
    attempts.splice(10, 0, login(accounts.dummy.email, PASSWORD));
    const mixed = await Promise.all(attempts);
    const evaluated = mixed.filter((r) => r.status !== 429);
    expect(evaluated.length).toBeLessThanOrEqual(5);
    // A session exists only if the correct password was among the evaluated
    // five — arrival order is not guaranteed, so "no more than five guesses"
    // is the promise asserted, not which five.
    const signedIn = mixed.filter((r) => r.status === 200).length;
    expect(await sessionsOf(accounts.dummy.id)).toBe(before + signedIn);
    expect(signedIn).toBeLessThanOrEqual(1);
  });

  it("API-17 keeps health public, and refuses a login with missing fields without counting it", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
    const empty = await request(app).post("/api/auth/login").send({});
    expect(empty.status).toBe(400);
    expect(Object.keys(empty.body.error.fields).sort()).toEqual(["email", "password"]);
    // Malformed requests that name a real email: not guesses, so not counted.
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/api/auth/login").send({ email: accounts.active.email, password: "" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.fields).toEqual({ password: "Enter your password." });
    }
    // Six malformed requests for that email did not throttle it.
    expect((await login(accounts.active.email, PASSWORD)).status).toBe(200);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("API-02 returns the signed-in user, and the login recorded lastLoginAt", async () => {
    const res = await login(accounts.active.email, PASSWORD);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookieOf(res));
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: accounts.active.id } });
    expect(row.lastLoginAt).not.toBeNull();
    expect(Date.now() - row.lastLoginAt!.getTime()).toBeLessThan(60_000);
  });

  it("API-09 logout deletes the session; the old cookie is refused; logout with no session still succeeds", async () => {
    const cookie = cookieOf(await login(accounts.active.email, PASSWORD));
    const out = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(String(out.headers["set-cookie"])).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Path=/api`));
    expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(tokenOf(cookie)) } })).toBe(0);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });

  it("API-10 treats an expired session as no session, and deletes it", async () => {
    const cookie = cookieOf(await login(accounts.active.email, PASSWORD));
    const tokenHash = hashSessionToken(tokenOf(cookie));
    await prisma.session.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
    expect(await prisma.session.count({ where: { tokenHash } })).toBe(0);
  });

  it("API-17 (current user) answers 401, not 500, without a session or with a made-up cookie", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=not-a-real-token`)).status).toBe(401);
  });
});

describe("Mandatory password change (BR-02) and POST /api/auth/change-password", () => {
  it("API-11 keeps a must-change session inside the change-password path until it changes the password", async () => {
    const cookie = cookieOf(await login(accounts.mustChange.email, PASSWORD));

    // Checked while the flag is still set: anything outside the allowed set is
    // refused, including routes that do not exist yet — the gate fails closed.
    for (const [method, path] of [
      ["get", "/api/tickets"],
      ["post", "/api/tickets/1/comments"],
      ["get", "/api/staff/tickets"],
    ] as const) {
      const res = await request(app)[method](path).set("Cookie", cookie).set("X-Dev-Requester-Id", String(accounts.mustChange.id));
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    }
    // Public endpoints do not act through the session (D-18).
    expect((await request(app).get("/api/categories").set("Cookie", cookie)).status).toBe(200);

    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: PASSWORD, newPassword: "Brand-new-pass-1" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The gate no longer applies: the route now answers as it would for any
    // Requester session. (The Lab 2 header sent alongside is ignored since Issue 4.)
    const after = await request(app).get("/api/tickets").set("Cookie", cookie).set("X-Dev-Requester-Id", String(accounts.mustChange.id));
    expect(after.status).toBe(200);
    expect((await request(app).post("/api/auth/logout").set("Cookie", cookie)).status).toBe(204);
  });

  it("API-12 lets the same session reach normal routes once the password is changed", async () => {
    const cookie = cookieOf(await login(accounts.changer.email, PASSWORD));
    const blocked = await request(app).get("/api/tickets").set("Cookie", cookie).set("X-Dev-Requester-Id", String(accounts.changer.id));
    expect(blocked.status).toBe(403);

    await request(app).post("/api/auth/change-password").set("Cookie", cookie).send({ currentPassword: PASSWORD, newPassword: "Changer-pass-22" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: accounts.changer.id } });
    expect(row.mustChangePassword).toBe(false);
    expect(await verifyPassword("Changer-pass-22", row.passwordHash)).toBe(true);

    const open = await request(app).get("/api/tickets").set("Cookie", cookie).set("X-Dev-Requester-Id", String(accounts.changer.id));
    expect(open.status).toBe(200);
  });

  it("API-13 rejects every rule violation and a reused password on the newPassword field, changing nothing", async () => {
    const cookie = cookieOf(await login(accounts.active.email, PASSWORD));
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: accounts.active.id } })).passwordHash;
    const cases: [string, RegExp][] = [
      ["Short-1", /10 to 128/],
      ["a1" + "b".repeat(127), /10 to 128/],
      ["no-digits-at-all", /number/],
      ["1234567890123", /letter/],
      [accounts.active.email.toUpperCase(), /email/],
      [PASSWORD, /different from your current/],
      ["", /Enter a new password/],
    ];
    for (const [newPassword, message] of cases) {
      const res = await request(app).post("/api/auth/change-password").set("Cookie", cookie).send({ currentPassword: PASSWORD, newPassword });
      expect(res.status, newPassword).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.fields.newPassword, newPassword).toMatch(message);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: accounts.active.id } })).passwordHash).toBe(before);
  });

  it("API-14 reports a wrong current password on its own field (400, not 401) and keeps the session", async () => {
    const cookie = cookieOf(await login(accounts.active.email, PASSWORD));
    const res = await request(app).post("/api/auth/change-password").set("Cookie", cookie).send({ currentPassword: WRONG, newPassword: "Another-pass-33" });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ currentPassword: "Your current password is incorrect." });
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    expect(await verifyPassword(PASSWORD, (await prisma.user.findUniqueOrThrow({ where: { id: accounts.active.id } })).passwordHash)).toBe(true);
  });

  it("API-15 ends every other session of the user; the one that changed the password stays signed in (BR-19)", async () => {
    const a = cookieOf(await login(accounts.twoSessions.email, PASSWORD));
    const b = cookieOf(await login(accounts.twoSessions.email, PASSWORD));
    expect(a).not.toBe(b);

    const res = await request(app).post("/api/auth/change-password").set("Cookie", a).send({ currentPassword: PASSWORD, newPassword: "Two-sessions-44" });
    expect(res.status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", b)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", a)).status).toBe(200);
  });

  it("API-16 never stores the plaintext and never returns a hash or token in any auth response", async () => {
    const res = await login(accounts.active.email, PASSWORD);
    const cookie = cookieOf(res);
    const bodies = [
      res.body,
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).body,
      (await request(app).post("/api/auth/change-password").set("Cookie", cookie).send({ currentPassword: WRONG, newPassword: "Whatever-pass-55" })).body,
    ];
    for (const body of bodies) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/passwordHash|tokenHash|scrypt\$/);
      expect(text).not.toContain(tokenOf(cookie));
      expect(text).not.toContain(PASSWORD);
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: accounts.active.id } });
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it("refuses change-password without a session (401)", async () => {
    const res = await request(app).post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "Whatever-pass-66" });
    expect(res.status).toBe(401);
  });
});
