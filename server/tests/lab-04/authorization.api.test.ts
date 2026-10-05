import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request, { type Response, type Test } from "supertest";
import type { Role } from "@prisma/client";
import { app } from "../../src/app.js";
import { authRouter } from "../../src/auth.js";
import { ROUTE_POLICIES } from "../../src/authorization.js";
import { getPrisma } from "../../src/prisma.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// SEC-01 to SEC-06 — authorization for the whole Lab 4 API
// (docs/lab-04/specification.md BR-15 to BR-18, api-spec.md §0.1, §5).
//
// The matrix is written out here from Lab 3 api-spec §7 and Lab 4 api-spec §5,
// not read from src/authorization.ts, so a mistake in the implementation's
// table cannot agree with itself. SEC-05 proves the two tables are the same.

const prisma = getPrisma();
const stamp = Date.now();

type Who = "public" | "optional" | "any" | Role[];
type Method = "GET" | "POST" | "PATCH";
type Row = { method: Method; path: string; who: Who; duringPasswordChange?: true };

const R: Role = "REQUESTER";
const S: Role = "IT_STAFF";
const A: Role = "ADMINISTRATOR";

// `:t` ticket, `:a` attachment, `:u` user, `:x` action.
const LAB3: Row[] = [
  { method: "GET", path: "/api/health", who: "public" },
  { method: "POST", path: "/api/auth/login", who: "public" },
  { method: "POST", path: "/api/auth/logout", who: "optional" },
  { method: "GET", path: "/api/auth/me", who: "any", duringPasswordChange: true },
  { method: "POST", path: "/api/auth/change-password", who: "any", duringPasswordChange: true },
  { method: "GET", path: "/api/categories", who: "public" },
  { method: "GET", path: "/api/systems", who: "public" },
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
const LAB4: Row[] = [
  { method: "GET", path: "/api/tickets/:t/actions-taken", who: [R, S, A] },
  { method: "POST", path: "/api/tickets/:t/actions-taken", who: [S, A] },
  { method: "PATCH", path: "/api/tickets/:t/actions-taken/:x", who: [S, A] },
  { method: "PATCH", path: "/api/tickets/:t/actions-taken/:x/status", who: [S, A] },
  { method: "GET", path: "/api/tickets/:t/actions-taken/:x/history", who: [S, A] },
  { method: "GET", path: "/api/dashboard/requester", who: [R] },
  { method: "GET", path: "/api/dashboard/staff", who: [S] },
  { method: "GET", path: "/api/dashboard/admin", who: [A] },
];
const MATRIX = [...LAB3, ...LAB4];
const ROLES: Role[] = [R, S, A];
const granted = (row: Row, role: Role) => row.who === "any" || (Array.isArray(row.who) && row.who.includes(role));

const users = {} as Record<"requester" | "other" | "staff" | "admin", number>;
const cookies = {} as Record<keyof typeof users, string>;
let ownTicket: number;
let otherTicket: number;
let ownAction: number;
let otherAction: number;
const MISSING = 2_000_000_000;

function build(row: Row, cookie?: string, origin?: string, ids = { t: ownTicket, x: ownAction }): Test {
  const url = row.path.replace(":t", String(ids.t)).replace(":a", String(MISSING)).replace(":u", String(users.other)).replace(":x", String(ids.x));
  const base = row.method === "GET" ? request(app).get(url) : row.method === "POST" ? request(app).post(url) : request(app).patch(url);
  if (cookie) base.set("Cookie", cookie);
  if (origin) base.set("Origin", origin);
  return row.method === "GET" ? base : base.send({});
}

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
      ticketNumber: `AUTHZ4-${stamp}-${n}`, requesterId, categoryId: category.id, relatedSystemId: system.id,
      summary: `Lab 4 authorization ticket ${n}`, description: "Created by the Lab 4 authorization suite.",
      itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", createdAt: new Date(Date.now() - 86_400_000),
    },
  });
}

async function makeAction(ticketId: number) {
  const action = await prisma.actionTaken.create({
    data: { ticketId, actionAt: new Date(), description: "Authorization fixture", assigneeId: users.staff, createdById: users.staff },
  });
  return action.id;
}

beforeAll(async () => {
  const make = async (key: keyof typeof users, role: Role) => {
    const user = await prisma.user.create({ data: { name: `Authz4 ${key}`, email: `authz4.${key}.${stamp}@kmutt.ac.th`, role, mustChangePassword: false } });
    users[key] = user.id;
    cookies[key] = await sessionCookieFor(prisma, user.id);
  };
  await make("requester", R);
  await make("other", R);
  await make("staff", S);
  await make("admin", A);
  ownTicket = (await makeTicket(users.requester, 1)).id;
  otherTicket = (await makeTicket(users.other, 2)).id;
  ownAction = await makeAction(ownTicket);
  otherAction = await makeAction(otherTicket);
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: [ownTicket, otherTicket] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

const cookieFor: Record<Role, keyof typeof users> = { REQUESTER: "requester", IT_STAFF: "staff", ADMINISTRATOR: "admin" };

describe("SEC-01 the matrix over all 37 routes (BR-15)", () => {
  it("has 37 rows", () => {
    expect(MATRIX).toHaveLength(37);
  });

  it("answers 401 without a session, 403 to every denied role, and never 401/403 to a granted role", async () => {
    for (const row of MATRIX.filter((r) => Array.isArray(r.who) || r.who === "any")) {
      const label = `${row.method} ${row.path}`;
      expectBareError(await build(row), 401, "UNAUTHENTICATED", `${label} (no session)`);
      for (const role of ROLES) {
        const res = await build(row, cookies[cookieFor[role]]);
        if (granted(row, role)) expect([401, 403], `${label} as ${role}`).not.toContain(res.status);
        else expectBareError(res, 403, "FORBIDDEN", `${label} as ${role}`);
      }
    }
    // Nothing the sweep sent changed the fixtures.
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: ownAction } })).version).toBe(1);
  });
});

describe("Requesters and Actions Taken (BR-18)", () => {
  it("SEC-02 refuses every write and history route with the same 403, whatever the ticket", async () => {
    const writes = LAB4.filter((r) => r.path.includes("actions-taken") && !(r.method === "GET" && r.path.endsWith("actions-taken")));
    expect(writes).toHaveLength(4);
    const bodies = new Set<string>();
    for (const row of writes) {
      for (const ids of [{ t: ownTicket, x: ownAction }, { t: otherTicket, x: otherAction }, { t: MISSING, x: MISSING }]) {
        const res = await build(row, cookies.requester, undefined, ids);
        expectBareError(res, 403, "FORBIDDEN", `${row.method} ${row.path} ${ids.t}`);
        bodies.add(res.text);
      }
    }
    expect(bodies.size).toBe(1);
  });

  it("SEC-03 answers another Requester's ticket exactly like a missing one", async () => {
    const other = await request(app).get(`/api/tickets/${otherTicket}/actions-taken`).set("Cookie", cookies.requester);
    const missing = await request(app).get(`/api/tickets/${MISSING}/actions-taken`).set("Cookie", cookies.requester);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect(other.text).not.toContain("Authorization fixture");
  });
});

describe("SEC-04 the Origin guard on the new routes (Lab 3 BR-26)", () => {
  it("refuses a foreign or null Origin before anything changes", async () => {
    for (const row of LAB4.filter((r) => r.method !== "GET")) {
      for (const origin of ["https://evil.example", "null"]) {
        expectBareError(await build(row, cookies.staff, origin), 403, "FORBIDDEN_ORIGIN", `${row.method} ${row.path} ${origin}`);
      }
    }
    expect(await prisma.actionTaken.count({ where: { ticketId: ownTicket } })).toBe(1);
  });
});

describe("SEC-05 the route-policy table is the contract (api-spec §5)", () => {
  function registeredRoutes(): { method: string; path: string }[] {
    const out: { method: string; path: string }[] = [];
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

  it("classifies every registered route, and the table equals the 37-row matrix", () => {
    const policies = ROUTE_POLICIES.map((p) => `${p.method} ${normalise(p.path)}`);
    expect(new Set(policies).size).toBe(policies.length);
    for (const route of registeredRoutes()) {
      expect(policies, `${route.method} ${route.path} is unclassified`).toContain(`${route.method} ${normalise(route.path)}`);
    }
    const asWho = (p: (typeof ROUTE_POLICIES)[number]) => {
      const a = p.access;
      const who = a.kind === "roles" ? [...a.roles].sort().join(",") : a.kind;
      return `${p.method} ${normalise(p.path)} ${who}${a.kind === "any" && a.duringPasswordChange ? " +pw" : ""}`;
    };
    const expected = MATRIX.map((row) => `${row.method} ${normalise(row.path)} ${Array.isArray(row.who) ? [...row.who].sort().join(",") : row.who}${row.duringPasswordChange ? " +pw" : ""}`);
    expect(ROUTE_POLICIES.map(asWho).sort()).toEqual(expected.sort());
  });

  it("answers an unlisted method on an action route with 404", async () => {
    const path = `/api/tickets/${ownTicket}/actions-taken/${ownAction}`;
    for (const res of [
      await request(app).delete(path).set("Cookie", cookies.staff),
      await request(app).put(path).set("Cookie", cookies.staff).send({}),
      await request(app).post(path).set("Cookie", cookies.staff).send({}),
    ]) {
      expectBareError(res, 404, "NOT_FOUND", "unlisted method");
    }
  });
});

describe("SEC-06 Administrators still cannot change a ticket (BR-17, Lab 3 BR-21)", () => {
  it("refuses owner, IT Priority, status, comment, and note changes with 403", async () => {
    for (const row of LAB3.filter((r) => r.method !== "GET" && Array.isArray(r.who) && r.who.includes(S) && !r.who.includes(A))) {
      expectBareError(await build(row, cookies.admin), 403, "FORBIDDEN", `${row.method} ${row.path}`);
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicket } });
    expect([ticket.currentStatus, ticket.ownerId]).toEqual(["IN_PROGRESS", null]);
  });
});
