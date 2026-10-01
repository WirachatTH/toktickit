import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request, { type Response, type Test } from "supertest";
import type { Role } from "@prisma/client";
import fs from "node:fs/promises";
import { app } from "../../src/app.js";
import { authRouter } from "../../src/auth.js";
import { storedFilePath } from "../../src/attachmentStorage.js";
import { hashPassword } from "../../src/password.js";
import { ROUTE_POLICIES } from "../../src/authorization.js";
import { getPrisma } from "../../src/prisma.js";
import { hashSessionToken, SESSION_COOKIE } from "../../src/session.js";
import { endTestSessions, sessionCookieFor } from "./helpers/sessions.js";

// SEC-01 to SEC-09, SEC-12, SEC-13 — the authorization layer and safe errors
// (docs/lab-03/specification.md BR-20 to BR-27, api-spec.md §0.2, §0.3, §0.5, §7).
//
// The matrix below is written out here from api-spec §7 on purpose, not read
// from src/authorization.ts: a test that imported the table it checks would
// agree with any mistake in it. SEC-13 then proves the two are the same.
//
// Every user and ticket here is created by this file and removed afterwards
// (D-22); seeded rows are only read.

const prisma = getPrisma();
const stamp = Date.now();

type Who = "public" | "optional" | "any" | Role[];
type Row = { method: "GET" | "POST" | "PATCH"; path: string; who: Who; duringPasswordChange?: true };

const R: Role = "REQUESTER";
const S: Role = "IT_STAFF";
const A: Role = "ADMINISTRATOR";

// `:t` is a ticket id and `:a` an attachment id; each request substitutes real ones.
const MATRIX: Row[] = [
  { method: "GET", path: "/api/health", who: "public" },
  { method: "POST", path: "/api/auth/login", who: "public" },
  { method: "POST", path: "/api/auth/logout", who: "optional" },
  { method: "GET", path: "/api/auth/me", who: "any", duringPasswordChange: true },
  { method: "POST", path: "/api/auth/change-password", who: "any", duringPasswordChange: true },
  { method: "GET", path: "/api/categories", who: "public" },
  { method: "GET", path: "/api/systems", who: "public" },
  // Lab 2's Development Requester list stays public until Issue 5 removes it (SEC-10).
  { method: "GET", path: "/api/requesters", who: "public" },
  { method: "POST", path: "/api/tickets", who: [R] },
  { method: "GET", path: "/api/tickets", who: [R] },
  { method: "GET", path: "/api/tickets/:t", who: [R] },
  { method: "POST", path: "/api/tickets/:t/attachments", who: [R] },
  { method: "GET", path: "/api/tickets/:t/attachments/:a", who: [R, S, A] },
  { method: "GET", path: "/api/tickets/:t/attachments/:a/download", who: [R, S, A] },
  { method: "PATCH", path: "/api/tickets/:t/attachments/:a/remove", who: [R] },
  { method: "POST", path: "/api/tickets/:t/appears-resolved", who: [R] },
  { method: "GET", path: "/api/tickets/:t/comments", who: [R, S, A] },
  { method: "POST", path: "/api/tickets/:t/comments", who: [R, S] },
  { method: "GET", path: "/api/tickets/:t/internal-notes", who: [S, A] },
  { method: "POST", path: "/api/tickets/:t/internal-notes", who: [S] },
  { method: "GET", path: "/api/staff/tickets", who: [S, A] },
  { method: "GET", path: "/api/staff/tickets/:t", who: [S, A] },
  { method: "GET", path: "/api/staff/assignable-users", who: [S, A] },
  { method: "PATCH", path: "/api/staff/tickets/:t/owner", who: [S] },
  { method: "PATCH", path: "/api/staff/tickets/:t/it-priority", who: [S] },
  { method: "PATCH", path: "/api/staff/tickets/:t/status", who: [S] },
  { method: "GET", path: "/api/admin/users", who: [A] },
  { method: "POST", path: "/api/admin/users", who: [A] },
  { method: "PATCH", path: "/api/admin/users/:u", who: [A] },
  { method: "POST", path: "/api/admin/users/:u/initial-password", who: [A] },
];
const PROTECTED = MATRIX.filter((row) => Array.isArray(row.who) || row.who === "any");
const ROLES: Role[] = [R, S, A];
const granted = (row: Row, role: Role) => row.who === "any" || (Array.isArray(row.who) && row.who.includes(role));

const users = {} as Record<"requester" | "other" | "staff" | "admin" | "mustChange", number>;
const cookies = {} as Record<keyof typeof users, string>;
let ownTicket: number;
let otherTicket: number;
let ownAttachment: number;
let otherAttachment: number;
const MISSING_TICKET = 2_000_000_000;

// SEC-09 — every response body this file receives is kept and scanned at the
// end. (Headers are not: a login's Set-Cookie is where the token belongs.)
const seen: { label: string; text: string }[] = [];
async function send(label: string, pending: Test): Promise<Response> {
  const res = await pending;
  seen.push({ label, text: res.text ?? "" });
  return res;
}

function build(method: Row["method"], path: string, cookie?: string, origin?: string): Test {
  const url = path.replace(":t", String(ownTicket)).replace(":a", String(ownAttachment)).replace(":u", String(users.requester));
  const base = method === "GET" ? request(app).get(url) : method === "POST" ? request(app).post(url) : request(app).patch(url);
  if (cookie) base.set("Cookie", cookie);
  if (origin) base.set("Origin", origin);
  return method === "GET" ? base : base.send({});
}

// A refusal carries the error envelope and nothing else (BR-23): no ticket,
// user, note, or count can ride along with it.
function expectBareError(res: Response, status: number, code: string, label: string) {
  expect(res.status, label).toBe(status);
  expect(Object.keys(res.body), label).toEqual(["error"]);
  expect(Object.keys(res.body.error).sort(), label).toEqual(["code", "message"]);
  expect(res.body.error.code, label).toBe(code);
}

async function makeTicket(requesterId: number, n: number) {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `AUTHZ-${stamp}-${n}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `Authorization suite ticket ${n}`,
      description: "Created by the Lab 3 authorization suite.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
    },
  });
}

beforeAll(async () => {
  const make = async (key: keyof typeof users, role: Role, mustChangePassword = false) => {
    const user = await prisma.user.create({
      data: { name: `Authz ${key}`, email: `authz.${key.toLowerCase()}.${stamp}@kmutt.ac.th`, role, mustChangePassword },
    });
    users[key] = user.id;
    cookies[key] = await sessionCookieFor(prisma, user.id);
  };
  await make("requester", R);
  await make("other", R);
  await make("staff", S);
  await make("admin", A);
  await make("mustChange", S, true);

  ownTicket = (await makeTicket(users.requester, 1)).id;
  otherTicket = (await makeTicket(users.other, 2)).id;
  // Attachment rows only: no request below reads the file of an attachment it is refused.
  const attach = (ticketId: number, n: number) =>
    prisma.attachment.create({
      data: { ticketId, originalFilename: "evidence.pdf", storedFilename: `authz-${stamp}-${n}.pdf`, mimeType: "application/pdf", sizeBytes: 10 },
    });
  ownAttachment = (await attach(ownTicket, 1)).id;
  otherAttachment = (await attach(otherTicket, 2)).id;
  // The own attachment's bytes exist, so a granted download really downloads.
  await fs.writeFile(storedFilePath(`authz-${stamp}-1.pdf`), "%PDF-1.4\n%%EOF");
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.unlink(storedFilePath(`authz-${stamp}-1.pdf`)).catch(() => {});
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [users.requester, users.other] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

describe("the BR-20 matrix, swept route by route", () => {
  it("SEC-01 answers every protected route with 401 UNAUTHENTICATED and nothing else when there is no session", async () => {
    expect(PROTECTED).toHaveLength(24);
    for (const row of PROTECTED) {
      const label = `${row.method} ${row.path}`;
      expectBareError(await send(label, build(row.method, row.path)), 401, "UNAUTHENTICATED", label);
    }
    // An unknown or forged cookie is no session at all.
    const forged = await send("forged cookie", build("GET", "/api/tickets", `${SESSION_COOKIE}=not-a-real-token`));
    expectBareError(forged, 401, "UNAUTHENTICATED", "forged cookie");
  });

  it("SEC-02 answers every route a role is not granted with 403 FORBIDDEN and no resource data", async () => {
    let refusals = 0;
    for (const row of PROTECTED) {
      for (const role of ROLES.filter((r) => !granted(row, r))) {
        const label = `${role} ${row.method} ${row.path}`;
        expectBareError(await send(label, build(row.method, row.path, cookies[roleKey(role)])), 403, "FORBIDDEN", label);
        refusals++;
      }
    }
    expect(refusals).toBe(33); // every "no" in api-spec §7
  });

  it("SEC-03 lets every granted role through the guard (never 401 or 403), Administrators on assignable users included", async () => {
    let admitted = 0;
    for (const row of PROTECTED) {
      for (const role of ROLES.filter((r) => granted(row, r))) {
        const label = `${role} ${row.method} ${row.path}`;
        const res = await send(label, build(row.method, row.path, cookies[roleKey(role)]));
        expect([401, 403], `${label} -> ${res.status} ${res.body?.error?.code ?? ""}`).not.toContain(res.status);
        admitted++;
      }
    }
    expect(admitted).toBe(39);
    const adminAssignable = await send("admin assignable", build("GET", "/api/staff/assignable-users", cookies.admin));
    expect([401, 403]).not.toContain(adminAssignable.status);
  });
});

function roleKey(role: Role): "requester" | "staff" | "admin" {
  return role === R ? "requester" : role === S ? "staff" : "admin";
}

describe("what a Requester can learn about other people's tickets", () => {
  it("SEC-04 refuses a Requester Internal Notes on an own ticket, another's, and a missing one, identically", async () => {
    for (const method of ["GET", "POST"] as const) {
      const bodies = [];
      for (const ticket of [ownTicket, otherTicket, MISSING_TICKET]) {
        const label = `${method} notes on ${ticket}`;
        const pending = method === "GET"
          ? request(app).get(`/api/tickets/${ticket}/internal-notes`)
          : request(app).post(`/api/tickets/${ticket}/internal-notes`).send({ body: "A note a Requester must never write" });
        const res = await send(label, pending.set("Cookie", cookies.requester));
        expectBareError(res, 403, "FORBIDDEN", label);
        bodies.push(res.text);
      }
      expect(new Set(bodies).size, method).toBe(1);
    }
  });

  it("SEC-05 answers another Requester's ticket, attachment metadata, download, and comments exactly like a missing ticket", async () => {
    const routes: [string, (ticket: number, attachment: number) => string][] = [
      ["ticket detail", (t) => `/api/tickets/${t}`],
      ["attachment metadata", (t, a) => `/api/tickets/${t}/attachments/${a}`],
      ["attachment download", (t, a) => `/api/tickets/${t}/attachments/${a}/download`],
      ["comments", (t) => `/api/tickets/${t}/comments`],
    ];
    for (const [label, path] of routes) {
      const theirs = await send(label, request(app).get(path(otherTicket, otherAttachment)).set("Cookie", cookies.requester));
      const missing = await send(label, request(app).get(path(MISSING_TICKET, otherAttachment)).set("Cookie", cookies.requester));
      expect(theirs.status, label).toBe(404);
      expect(theirs.body, label).toEqual(missing.body);
      expect(theirs.text, label).not.toContain("Authorization suite ticket");
    }
    // The same requests on the Requester's own ticket do succeed, so the 404s above are about ownership.
    expect((await send("own detail", request(app).get(`/api/tickets/${ownTicket}`).set("Cookie", cookies.requester))).status).toBe(200);
    expect((await send("own metadata", request(app).get(`/api/tickets/${ownTicket}/attachments/${ownAttachment}`).set("Cookie", cookies.requester))).status).toBe(200);
    // IT Staff and Administrators read attachment metadata on any ticket (api-spec §3.6).
    for (const who of ["staff", "admin"] as const) {
      const res = await send(`${who} metadata`, request(app).get(`/api/tickets/${otherTicket}/attachments/${otherAttachment}`).set("Cookie", cookies[who]));
      expect(res.status, who).toBe(200);
      expect(res.body.id).toBe(otherAttachment);
    }
  });
});

describe("cross-site requests (BR-26)", () => {
  const FOREIGN = "https://evil.example";

  it("SEC-06 refuses POST, PATCH, and a multipart upload from a foreign origin or Origin: null, changing nothing", async () => {
    for (const origin of [FOREIGN, "null"]) {
      const login = await send(`login ${origin}`, request(app).post("/api/auth/login").set("Origin", origin).send({ email: "x@kmutt.ac.th", password: "y" }));
      expectBareError(login, 403, "FORBIDDEN_ORIGIN", `login ${origin}`);
      expect(login.headers["set-cookie"]).toBeUndefined();

      const remove = await send(`remove ${origin}`,
        request(app).patch(`/api/tickets/${ownTicket}/attachments/${ownAttachment}/remove`).set("Cookie", cookies.requester).set("Origin", origin).send({ reason: "Forged from another site" }));
      expectBareError(remove, 403, "FORBIDDEN_ORIGIN", `remove ${origin}`);

      const before = await prisma.attachment.count({ where: { ticketId: ownTicket } });
      const upload = await send(`upload ${origin}`,
        request(app).post(`/api/tickets/${ownTicket}/attachments`).set("Cookie", cookies.requester).set("Origin", origin)
          .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), { filename: "forged.pdf", contentType: "application/pdf" }));
      expectBareError(upload, 403, "FORBIDDEN_ORIGIN", `upload ${origin}`);
      expect(await prisma.attachment.count({ where: { ticketId: ownTicket } })).toBe(before);
    }
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: ownAttachment } })).isRemoved).toBe(false);
  });

  it("SEC-06 lets both default client origins through, and never blocks a GET", async () => {
    for (const origin of ["http://localhost:5173", "http://localhost:5174"]) {
      // A wrong password proves the login handler ran.
      const login = await send(`login ${origin}`, request(app).post("/api/auth/login").set("Origin", origin).send({ email: `nobody.${stamp}@kmutt.ac.th`, password: "Wrong-pass-1" }));
      expect(login.status, origin).toBe(401);
      // An unsupported file type proves the upload handler ran, without storing a file.
      const upload = await send(`upload ${origin}`,
        request(app).post(`/api/tickets/${ownTicket}/attachments`).set("Cookie", cookies.requester).set("Origin", origin)
          .attach("file", Buffer.from("plain text"), { filename: "notes.txt", contentType: "text/plain" }));
      expect(upload.status, origin).toBe(415);
      // A too-short reason proves the remove handler ran, without removing anything.
      const remove = await send(`remove ${origin}`,
        request(app).patch(`/api/tickets/${ownTicket}/attachments/${ownAttachment}/remove`).set("Cookie", cookies.requester).set("Origin", origin).send({ reason: "x" }));
      expect(remove.status, origin).toBe(400);
    }
    const read = await send("GET foreign", request(app).get("/api/auth/me").set("Cookie", cookies.requester).set("Origin", FOREIGN));
    expect(read.status).toBe(200);
  });
});

describe("guard order (BR-22)", () => {
  it("SEC-07 says 'sign in' before 'not allowed', and 'change your password' before both", async () => {
    // No session on a route the caller's role could never use: 401, not 403.
    expectBareError(await send("no session staff", build("PATCH", "/api/staff/tickets/:t/status")), 401, "UNAUTHENTICATED", "no session");
    // A must-change session on a route its role is refused: the password change wins.
    expectBareError(await send("must-change admin route", build("GET", "/api/admin/users", cookies.mustChange)), 403, "PASSWORD_CHANGE_REQUIRED", "must-change");
    // ...and the three allowed routes stay open to it.
    expect((await send("must-change me", build("GET", "/api/auth/me", cookies.mustChange))).status).toBe(200);
    // The origin check runs before everything, even before the body is read.
    const forged = await send("foreign malformed",
      request(app).post("/api/tickets").set("Origin", "https://evil.example").set("Content-Type", "application/json").send("{not json"));
    expectBareError(forged, 403, "FORBIDDEN_ORIGIN", "foreign + malformed JSON");
    // Role before validation: a malformed body from the wrong role is still 403.
    const wrongRole = await send("staff malformed",
      request(app).post("/api/tickets").set("Cookie", cookies.staff).set("Content-Type", "application/json").send("{not json"));
    expectBareError(wrongRole, 403, "FORBIDDEN", "wrong role + malformed JSON");
    // Session before validation: a malformed body with no session is 401.
    const anonymous = await send("anonymous malformed",
      request(app).post("/api/tickets").set("Content-Type", "application/json").send("{not json"));
    expectBareError(anonymous, 401, "UNAUTHENTICATED", "no session + malformed JSON");
  });
});

describe("Administrators are read-only on tickets (BR-21)", () => {
  it("SEC-08 refuses an Administrator owner, IT Priority, status, comment, and note changes, leaving the ticket as it was", async () => {
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicket } });
    const attempts: [string, Test][] = [
      ["owner", request(app).patch(`/api/staff/tickets/${ownTicket}/owner`).send({ ownerId: users.admin, expectedOwnerId: null })],
      ["IT Priority", request(app).patch(`/api/staff/tickets/${ownTicket}/it-priority`).send({ itPriority: "HIGH" })],
      ["status", request(app).patch(`/api/staff/tickets/${ownTicket}/status`).send({ status: "OPEN", expectedStatus: "NEW" })],
      ["comment", request(app).post(`/api/tickets/${ownTicket}/comments`).send({ body: "An Administrator must not post this" })],
      ["note", request(app).post(`/api/tickets/${ownTicket}/internal-notes`).send({ body: "An Administrator must not post this" })],
    ];
    for (const [label, pending] of attempts) {
      expectBareError(await send(`admin ${label}`, pending.set("Cookie", cookies.admin)), 403, "FORBIDDEN", label);
    }
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicket } });
    expect(after).toEqual(before);
    expect(await prisma.publicComment.count({ where: { ticketId: ownTicket } })).toBe(0);
    expect(await prisma.internalNote.count({ where: { ticketId: ownTicket } })).toBe(0);
  });
});

describe("safe errors (§6.2, api-spec §0.4–§0.5)", () => {
  const leaks = /stack|prisma|SELECT|node_modules|\.ts:\d|[A-Z]:\\\\|\/app\//i;

  it("SEC-12 gives each failure its own status in one envelope, and never leaks internals", async () => {
    const big = JSON.stringify({ reason: "x".repeat(200_000) });
    const cases: [string, Test, number, string][] = [
      ["malformed JSON", request(app).patch(`/api/tickets/${ownTicket}/attachments/${ownAttachment}/remove`).set("Cookie", cookies.requester).set("Content-Type", "application/json").send("{not json"), 400, "VALIDATION_ERROR"],
      ["body over the JSON limit", request(app).patch(`/api/tickets/${ownTicket}/attachments/${ownAttachment}/remove`).set("Cookie", cookies.requester).set("Content-Type", "application/json").send(big), 413, "PAYLOAD_TOO_LARGE"],
      ["unsupported charset", request(app).patch(`/api/tickets/${ownTicket}/attachments/${ownAttachment}/remove`).set("Cookie", cookies.requester).set("Content-Type", "application/json; charset=klingon").send("{}"), 415, "UNSUPPORTED_MEDIA_TYPE"],
      ["unknown API route", request(app).get("/api/no-such-thing").set("Cookie", cookies.requester), 404, "NOT_FOUND"],
      ["unknown method on a known path", request(app).delete("/api/tickets").set("Cookie", cookies.requester), 404, "NOT_FOUND"],
      ["granted route not built yet", request(app).get("/api/staff/tickets").set("Cookie", cookies.staff), 404, "NOT_FOUND"],
    ];
    for (const [label, pending, status, code] of cases) {
      const res = await send(label, pending);
      expectBareError(res, status, code, label);
      expect(res.text, label).not.toMatch(leaks);
    }
    // Nothing above removed the attachment.
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: ownAttachment } })).isRemoved).toBe(false);
  });

  it("SEC-12 turns an unexpected failure into a safe 500, and the server keeps answering", async () => {
    // A database failure while resolving the session (middleware path)...
    const lookup = vi.spyOn(prisma.session, "findUnique").mockRejectedValueOnce(new Error('relation "Session" does not exist at /app/src/session.ts:81'));
    const middleware = await send("session lookup fails", request(app).get("/api/auth/me").set("Cookie", cookies.requester));
    expectBareError(middleware, 500, "INTERNAL_ERROR", "middleware failure");
    expect(middleware.body.error.message).toBe("Something went wrong. Please try again.");
    expect(middleware.text).not.toMatch(leaks);
    lookup.mockRestore();

    // ...and inside a handler.
    const list = vi.spyOn(prisma.ticket, "findMany").mockRejectedValueOnce(new Error("SELECT * FROM \"Ticket\" failed"));
    const handler = await send("handler fails", request(app).get("/api/tickets").set("Cookie", cookies.requester));
    expectBareError(handler, 500, "INTERNAL_ERROR", "handler failure");
    expect(handler.text).not.toMatch(leaks);
    list.mockRestore();

    expect((await send("health afterwards", request(app).get("/api/health"))).status).toBe(200);
  });
});

describe("every route is classified (labsheet §4.3)", () => {
  type Registered = { method: string; path: string };

  function registeredRoutes(): Registered[] {
    const out: Registered[] = [];
    const collect = (stack: unknown[], prefix: string) => {
      for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    };
    collect((app as unknown as { _router: { stack: unknown[] } })._router.stack, "");
    collect((authRouter as unknown as { stack: unknown[] }).stack, "/api/auth");
    return out;
  }

  const normalise = (path: string) => path.replace(/:[A-Za-z]+/g, ":p");

  it("SEC-13 gives every registered route exactly one policy, and the policy table is api-spec §7", () => {
    const policies = ROUTE_POLICIES.map((p) => `${p.method} ${normalise(p.path)}`);
    expect(new Set(policies).size, "duplicate policies").toBe(policies.length);

    const registered = registeredRoutes();
    expect(registered.length).toBeGreaterThan(10);
    for (const route of registered) {
      expect(policies, `${route.method} ${route.path} is registered but unclassified`).toContain(`${route.method} ${normalise(route.path)}`);
    }

    // The implementation's table and the contract's are the same table.
    const asWho = (p: (typeof ROUTE_POLICIES)[number]): string => {
      const a = p.access;
      const who = a.kind === "roles" ? [...a.roles].sort().join(",") : a.kind;
      return `${p.method} ${normalise(p.path)} ${who}${a.kind === "any" && a.duringPasswordChange ? " +pw" : ""}`;
    };
    const expected = MATRIX.map((row) => {
      const who = Array.isArray(row.who) ? [...row.who].sort().join(",") : row.who;
      return `${row.method} ${normalise(row.path)} ${who}${row.duringPasswordChange ? " +pw" : ""}`;
    });
    expect(ROUTE_POLICIES.map(asWho).sort()).toEqual(expected.sort());
  });
});

describe("no secrets leave the server (BR-06, BR-15)", () => {
  it("SEC-09 finds no password hash, token hash, or session token in any response this suite received", async () => {
    // Add the user-carrying responses explicitly, so the scan covers them even if earlier tests change:
    // a real login (its token arrives in Set-Cookie, never in the body), /me, and the Lab 2 list.
    const password = "Scan-pass-2026";
    await prisma.user.update({ where: { id: users.other }, data: { passwordHash: await hashPassword(password) } });
    const login = await send("login", request(app).post("/api/auth/login").send({ email: `authz.other.${stamp}@kmutt.ac.th`, password }));
    expect(login.status).toBe(200);
    const issued = (login.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    cookies.other = issued.split(";")[0];
    await send("me", request(app).get("/api/auth/me").set("Cookie", cookies.staff));
    await send("requesters", request(app).get("/api/requesters"));
    expect(seen.length).toBeGreaterThan(100);

    const tokens = Object.values(cookies).map((c) => c.slice(SESSION_COOKIE.length + 1));
    const forbidden = [/passwordHash/i, /tokenHash/i, /scrypt\$/, ...tokens.flatMap((t) => [t, hashSessionToken(t)])];
    for (const { label, text } of seen) {
      for (const needle of forbidden) {
        if (typeof needle === "string") expect(text.includes(needle), `${label} leaks a session token or its hash`).toBe(false);
        else expect(text, label).not.toMatch(needle);
      }
    }
  });
});
