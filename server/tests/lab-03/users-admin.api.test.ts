import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Role } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/password.js";
import { resetLoginThrottle } from "../../src/loginThrottle.js";
import { SESSION_COOKIE } from "../../src/session.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// API-60 to API-69, API-71, API-72, API-77 — Administrator user management
// (docs/lab-03/api-spec.md §6, specification.md BR-53 to BR-60, BR-81).
//
// The development database always has at least two seeded Administrators, so
// LAST_ADMINISTRATOR cannot be reached here; API-70 and API-82 run in a
// throwaway schema in last-administrator.api.test.ts (D-22). Every user this
// file creates carries the stamp and is removed afterwards.

const prisma = getPrisma();
const stamp = Date.now();
const TAG = `adm${stamp}`;
const PASSWORD = "Initial-pass-2026";
const NEW_PASSWORD = "Changed-pass-2026";
const createdIds: number[] = [];
const ticketIds: number[] = [];
let adminId: number;
let adminCookie: string;
let staffCookie: string;
let requesterCookie: string;
let requesterId: number;
let category: number;
let system: number;

const email = (local: string) => `${TAG}.${local}@kmutt.ac.th`;
const admin = () => ({
  get: (path: string) => request(app).get(path).set("Cookie", adminCookie),
  post: (path: string, body: object) => request(app).post(path).set("Cookie", adminCookie).send(body),
  patch: (path: string, body: object) => request(app).patch(path).set("Cookie", adminCookie).send(body),
});

async function makeUser(local: string, role: Role, data: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { name: `${TAG} ${local}`, email: email(local), role, mustChangePassword: false, passwordHash: await hashPassword(PASSWORD), ...data },
  });
  createdIds.push(user.id);
  return user;
}

const login = (address: string, password = PASSWORD) => request(app).post("/api/auth/login").send({ email: address, password });
function cookieOf(res: request.Response): string {
  const raw = (res.headers["set-cookie"] as unknown as string[]) ?? [];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(";")[0];
}

beforeAll(async () => {
  category = (await prisma.category.findFirstOrThrow()).id;
  system = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const a = await makeUser("caller", "ADMINISTRATOR");
  adminId = a.id;
  adminCookie = await sessionCookieFor(prisma, a.id);
  staffCookie = await sessionCookieFor(prisma, (await makeUser("staffcaller", "IT_STAFF")).id);
  requesterId = (await makeUser("requestercaller", "REQUESTER")).id;
  requesterCookie = await sessionCookieFor(prisma, requesterId);
});

beforeEach(() => resetLoginThrottle());

afterAll(async () => {
  resetLoginThrottle();
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  const mine = await prisma.user.findMany({ where: { email: { startsWith: `${TAG}.` } }, select: { id: true } });
  await prisma.session.deleteMany({ where: { userId: { in: mine.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: mine.map((u) => u.id) } } });
});

describe("the user list (§6.1)", () => {
  it("API-60 lists every user with name, email, role, status, and dates, by name — never password material", async () => {
    await makeUser("zed", "REQUESTER");
    await makeUser("amy", "IT_STAFF", { isActive: false });
    const res = await admin().get(`/api/admin/users?search=${TAG}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).toEqual([...names].sort((x: string, y: string) => x.localeCompare(y)));
    const amy = res.body.data.find((u: { email: string }) => u.email === email("amy"));
    expect(Object.keys(amy).sort()).toEqual(["createdAt", "email", "id", "isActive", "lastLoginAt", "mustChangePassword", "name", "role"]);
    expect(amy).toMatchObject({ role: "IT_STAFF", isActive: false });
    expect(res.text).not.toMatch(/passwordHash|scrypt\$|tokenHash/);
    // Without a search, every user is there (the seeded ones too).
    const all = await admin().get("/api/admin/users");
    expect(all.body.data.length).toBe(await prisma.user.count());
  });

  it("API-61 searches name and email case-insensitively, filters by role, and ignores an unknown role", async () => {
    await makeUser("searchable", "IT_STAFF", { name: `${TAG} Pimchanok Searchable` });
    const byName = await admin().get(`/api/admin/users?search=${encodeURIComponent(`${TAG} PIMCHANOK`)}`);
    expect(byName.body.data.map((u: { email: string }) => u.email)).toEqual([email("searchable")]);
    const byEmail = await admin().get(`/api/admin/users?search=${encodeURIComponent(`${TAG}.SEARCHABLE@`)}`);
    expect(byEmail.body.data.map((u: { email: string }) => u.email)).toEqual([email("searchable")]);
    const staff = await admin().get(`/api/admin/users?search=${TAG}&role=IT_STAFF`);
    expect(staff.body.data.length).toBeGreaterThan(0);
    for (const u of staff.body.data) expect(u.role).toBe("IT_STAFF");
    const unknown = await admin().get(`/api/admin/users?search=${TAG}&role=SUPERUSER`);
    const none = await admin().get(`/api/admin/users?search=${TAG}`);
    expect(unknown.body.data.length).toBe(none.body.data.length);
    expect((await admin().get(`/api/admin/users?search=${encodeURIComponent("  ")}`)).body.data.length).toBe(await prisma.user.count());
  });
});

describe("creating users (§6.2, BR-53 to BR-55)", () => {
  it("API-62 creates a user of each role, who must change the initial password at first sign-in", async () => {
    for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const) {
      const address = email(`new-${role.toLowerCase()}`);
      const res = await admin().post("/api/admin/users", { name: `  ${TAG} New ${role}  `, email: `  ${address.toUpperCase()}  `, role, isActive: true, initialPassword: PASSWORD });
      expect(res.status, role).toBe(201);
      expect(res.body).toEqual({ id: expect.any(Number), name: `${TAG} New ${role}`, email: address, role, isActive: true, mustChangePassword: true });
      createdIds.push(res.body.id);
      const signIn = await login(address);
      expect(signIn.status, role).toBe(200);
      expect(signIn.body.user.mustChangePassword).toBe(true);
      const blocked = await request(app).get("/api/tickets").set("Cookie", cookieOf(signIn));
      expect(blocked.body.error.code, role).toBe("PASSWORD_CHANGE_REQUIRED");
    }
    // Created inactive: the account exists but cannot sign in.
    const off = await admin().post("/api/admin/users", { name: `${TAG} Off`, email: email("off"), role: "REQUESTER", isActive: false, initialPassword: PASSWORD });
    expect(off.status).toBe(201);
    expect((await login(email("off"))).status).toBe(403);
  });

  it("API-63 refuses an email already in use in another letter case, on create and on edit, with 409 EMAIL_TAKEN", async () => {
    const taken = await makeUser("taken", "REQUESTER");
    const before = await prisma.user.count();
    const create = await admin().post("/api/admin/users", { name: `${TAG} Dup`, email: email("TAKEN").toUpperCase(), role: "REQUESTER", isActive: true, initialPassword: PASSWORD });
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe("EMAIL_TAKEN");
    expect(create.body.error.fields.email).toBeTruthy();
    expect(await prisma.user.count()).toBe(before);

    const other = await makeUser("other", "REQUESTER");
    const edit = await admin().patch(`/api/admin/users/${other.id}`, { email: taken.email.toUpperCase(), name: `${TAG} renamed` });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("EMAIL_TAKEN");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ email: other.email, name: other.name });
    // Keeping one's own email (in another case) is not a conflict.
    expect((await admin().patch(`/api/admin/users/${other.id}`, { email: other.email.toUpperCase() })).status).toBe(200);
  });

  it("API-64 answers each invalid field with 400 and its own message, creating nothing", async () => {
    const before = await prisma.user.count();
    const res = await admin().post("/api/admin/users", { name: "A", email: "not-an-email", role: "SUPERUSER", isActive: "yes", initialPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["email", "initialPassword", "isActive", "name", "role"]);
    for (const [body, field] of [
      [{ name: "x".repeat(101) }, "name"],
      [{ email: `${"e".repeat(250)}@kmutt.ac.th` }, "email"],
      [{ initialPassword: "no-digits-here" }, "initialPassword"],
      [{ initialPassword: email("weak") }, "initialPassword"],
      [{ role: "ADMIN" }, "role"],
    ] as const) {
      const one = await admin().post("/api/admin/users", { name: `${TAG} Valid`, email: email("weak"), role: "REQUESTER", isActive: true, initialPassword: PASSWORD, ...body });
      expect(one.status, field).toBe(400);
      expect(Object.keys(one.body.error.fields), field).toEqual([field]);
    }
    expect(await prisma.user.count()).toBe(before);
  });
});

describe("editing users (§6.3, BR-57, BR-59, BR-60)", () => {
  it("API-65 saves name, email, role, and activation", async () => {
    const u = await makeUser("editme", "REQUESTER");
    const res = await admin().patch(`/api/admin/users/${u.id}`, { name: `${TAG} Edited`, email: email("edited"), role: "IT_STAFF", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: u.id, name: `${TAG} Edited`, email: email("edited"), role: "IT_STAFF", isActive: false });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ name: `${TAG} Edited`, email: email("edited"), role: "IT_STAFF", isActive: false });
    // Password fields are not accepted here.
    const sneaky = await admin().patch(`/api/admin/users/${u.id}`, { passwordHash: "x", initialPassword: NEW_PASSWORD, mustChangePassword: false });
    expect(sneaky.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).toBe(u.passwordHash);
    expect((await admin().patch("/api/admin/users/2000000000", { name: `${TAG} ghost` })).status).toBe(404);
  });

  it("API-66 deactivating a signed-in user ends their session, and their next sign-in is refused as inactive", async () => {
    const u = await makeUser("deactivate", "REQUESTER");
    const theirs = cookieOf(await login(u.email));
    expect((await request(app).get("/api/auth/me").set("Cookie", theirs)).status).toBe(200);
    expect((await admin().patch(`/api/admin/users/${u.id}`, { isActive: false })).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", theirs)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    const again = await login(u.email);
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("API-67 changing a signed-in user's role ends their session, and the new role applies after signing in again", async () => {
    const u = await makeUser("promote", "REQUESTER");
    const theirs = cookieOf(await login(u.email));
    expect((await request(app).get("/api/staff/tickets").set("Cookie", theirs)).status).toBe(403);
    expect((await admin().patch(`/api/admin/users/${u.id}`, { role: "IT_STAFF" })).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", theirs)).status).toBe(401);
    const fresh = cookieOf(await login(u.email));
    expect((await request(app).get("/api/staff/tickets").set("Cookie", fresh)).status).toBe(200);
    expect((await request(app).get("/api/tickets").set("Cookie", fresh)).status).toBe(403);
    // A name-only edit does not sign anyone out.
    expect((await admin().patch(`/api/admin/users/${u.id}`, { name: `${TAG} Promoted` })).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", fresh)).status).toBe(200);
  });

  it("API-68 a new initial password ends the user's sessions, and the next sign-in uses it and must change it", async () => {
    const u = await makeUser("reset", "IT_STAFF");
    const theirs = cookieOf(await login(u.email));
    const res = await admin().post(`/api/admin/users/${u.id}/initial-password`, { initialPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: u.id, mustChangePassword: true });
    expect((await request(app).get("/api/auth/me").set("Cookie", theirs)).status).toBe(401);
    expect((await login(u.email, PASSWORD)).status).toBe(401);
    const signIn = await login(u.email, NEW_PASSWORD);
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.mustChangePassword).toBe(true);
    const weak = await admin().post(`/api/admin/users/${u.id}/initial-password`, { initialPassword: "weak" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.initialPassword).toBeTruthy();
    expect((await admin().post("/api/admin/users/2000000000/initial-password", { initialPassword: NEW_PASSWORD })).status).toBe(404);
  });

  it("API-69 refuses an Administrator deactivating themselves, changing their own role, or setting their own initial password", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    for (const [label, pending] of [
      ["deactivate self", admin().patch(`/api/admin/users/${adminId}`, { isActive: false })],
      ["own role", admin().patch(`/api/admin/users/${adminId}`, { role: "IT_STAFF" })],
      ["own initial password", admin().post(`/api/admin/users/${adminId}/initial-password`, { initialPassword: NEW_PASSWORD })],
    ] as const) {
      const res = await pending;
      expect(res.status, label).toBe(409);
      expect(res.body.error.code, label).toBe("SELF_CHANGE_FORBIDDEN");
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).toEqual(before);
    // Their own name may change, and restating their own role or active state is not a change.
    expect((await admin().patch(`/api/admin/users/${adminId}`, { name: `${TAG} caller renamed`, role: "ADMINISTRATOR", isActive: true })).status).toBe(200);
  });

  it("API-71 refuses demoting someone who owns open tickets until they are reassigned; deactivating them is allowed", async () => {
    const owner = await makeUser("owner", "IT_STAFF");
    const t = await prisma.ticket.create({
      data: { ticketNumber: `ADM${stamp}1`, requesterId, categoryId: category, relatedSystemId: system, summary: "Admin suite fixture", description: "x", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", ownerId: owner.id },
    });
    ticketIds.push(t.id);
    const refused = await admin().patch(`/api/admin/users/${owner.id}`, { role: "REQUESTER" });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("OWNS_OPEN_TICKETS");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("IT_STAFF");
    // A closed ticket does not count.
    await prisma.ticket.update({ where: { id: t.id }, data: { currentStatus: "CLOSED" } });
    expect((await admin().patch(`/api/admin/users/${owner.id}`, { role: "REQUESTER" })).status).toBe(200);

    const keeper = await makeUser("keeper", "IT_STAFF");
    const open = await prisma.ticket.create({
      data: { ticketNumber: `ADM${stamp}2`, requesterId, categoryId: category, relatedSystemId: system, summary: "Admin suite fixture", description: "x", itPriority: "MEDIUM", currentStatus: "OPEN", ownerId: keeper.id },
    });
    ticketIds.push(open.id);
    const deactivate = await admin().patch(`/api/admin/users/${keeper.id}`, { isActive: false });
    expect(deactivate.status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: open.id } })).ownerId).toBe(keeper.id);
  });

  it("API-72 has no route to delete a user", async () => {
    const u = await makeUser("nodelete", "REQUESTER");
    expect((await request(app).delete(`/api/admin/users/${u.id}`).set("Cookie", adminCookie)).status).toBe(404);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });
});

describe("races (BR-60, BR-81)", () => {
  it("API-77 a demotion racing an assignment never leaves a Requester owning an open ticket", async () => {
    const assigner = await makeUser("assigner", "IT_STAFF");
    const assignerCookie = await sessionCookieFor(prisma, assigner.id);
    for (let i = 0; i < 5; i++) {
      const target = await makeUser(`race${i}`, "IT_STAFF");
      const t = await prisma.ticket.create({
        data: { ticketNumber: `ADM${stamp}R${i}`, requesterId, categoryId: category, relatedSystemId: system, summary: "Admin race fixture", description: "x", itPriority: "MEDIUM", currentStatus: "OPEN", ownerId: assigner.id },
      });
      ticketIds.push(t.id);
      const [assign, demote] = await Promise.all([
        request(app).patch(`/api/staff/tickets/${t.id}/owner`).set("Cookie", assignerCookie).send({ ownerId: target.id, expectedOwnerId: assigner.id, expectedStatus: "OPEN" }),
        admin().patch(`/api/admin/users/${target.id}`, { role: "REQUESTER" }),
      ]);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      const owns = await prisma.ticket.count({ where: { ownerId: target.id, currentStatus: { notIn: ["CLOSED", "CANCELLED"] } } });
      expect(after.role === "REQUESTER" && owns > 0, `run ${i}`).toBe(false);
      const outcome = [assign.status, demote.status].sort().join(",");
      expect(["200,400", "200,409"], `run ${i}: assign ${assign.status} ${assign.body?.error?.code ?? ""} / demote ${demote.status} ${demote.body?.error?.code ?? ""}`).toContain(outcome);
      if (assign.status === 400) expect(assign.body.error.fields.ownerId).toBeTruthy();
      if (demote.status === 409) expect(demote.body.error.code).toBe("OWNS_OPEN_TICKETS");
    }
  });
});

describe("who may manage users (AC-41)", () => {
  it("refuses Requesters and IT Staff on every admin route with 403 and no user data (see SEC-11)", async () => {
    for (const cookie of [requesterCookie, staffCookie]) {
      for (const res of [
        await request(app).get("/api/admin/users").set("Cookie", cookie),
        await request(app).post("/api/admin/users").set("Cookie", cookie).send({ name: `${TAG} x`, email: email("x"), role: "ADMINISTRATOR", isActive: true, initialPassword: PASSWORD }),
        await request(app).patch(`/api/admin/users/${adminId}`).set("Cookie", cookie).send({ isActive: false }),
        await request(app).post(`/api/admin/users/${adminId}/initial-password`).set("Cookie", cookie).send({ initialPassword: NEW_PASSWORD }),
      ]) {
        expect(res.status).toBe(403);
        expect(res.text).not.toContain(TAG);
      }
    }
    expect(await prisma.user.count({ where: { email: email("x") } })).toBe(0);
  });
});
